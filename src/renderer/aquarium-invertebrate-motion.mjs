import * as THREE from '../../node_modules/three/build/three.module.js';
import { floorAt } from './aquarium-habitat.mjs';
import { fishContact, fishContactsOverlap, poseFishContact } from './aquarium-fish-contact.mjs';

const TAU=Math.PI*2;
const GROUND=.034;
const PROFILES={
  nerite:     {speed:.44, stride:3.1, radius:.43, height:.29, feed:4.2, cover:.44, rest:1.9},
  turbo:      {speed:.49, stride:4.4, radius:.50, height:.36, feed:4.5, cover:.48, rest:1.6},
  conch:      {speed:.58, stride:4.5, radius:.59, height:.42, feed:5.3, cover:.23, rest:2.6},
  cowrie:     {speed:.36, stride:3.6, radius:.50, height:.30, feed:4.1, cover:.65, rest:2.9},
  nudibranch: {speed:.34, stride:3.1, radius:.51, height:.32, feed:3.6, cover:.69, rest:1.8},
  octopus:    {speed:.94, stride:6.2, radius:.70, height:.70, feed:6.4, cover:.58, rest:3.8},
  cuttlefish: {speed:1.48,stride:8.4, radius:.90, height:.35, feed:8.6, cover:.28, rest:2.5, swim:true},
  scallop:    {speed:.91, stride:2.3, radius:.52, height:.56, feed:1.1, cover:.18, rest:8.0, hop:true},
  cleaner:    {speed:1.12,stride:5.6, radius:.40, height:.47, feed:6.5, cover:.53, rest:1.5, swim:true, lift:.84, notice:'clean'},
  cherry:     {speed:.94, stride:4.3, radius:.31, height:.36, feed:5.1, cover:.62, rest:1.1, swim:true, lift:.58, notice:'shy'},
  blueShrimp: {speed:.87, stride:4.2, radius:.34, height:.37, feed:5.2, cover:.69, rest:1.5, swim:true, lift:.62, notice:'shy'},
  pistol:     {speed:.79, stride:3.5, radius:.48, height:.41, feed:4.5, cover:.84, rest:2.1, notice:'shy'},
  hermit:     {speed:.71, stride:4.3, radius:.57, height:.50, feed:5.1, cover:.45, rest:1.7, sideways:.83, notice:'shy'},
  kelpCrab:   {speed:.90, stride:5.1, radius:.64, height:.43, feed:5.4, cover:.73, rest:1.3, sideways:1.23, notice:'display'},
  porcelain:  {speed:.55, stride:3.6, radius:.52, height:.40, feed:3.9, cover:.82, rest:2.4, sideways:1.11, filter:true, notice:'shy'},
  emerald:    {speed:.77, stride:4.5, radius:.57, height:.44, feed:5.3, cover:.63, rest:1.6, sideways:1.21, notice:'display'},
  lobster:    {speed:1.04,stride:6.1, radius:.76, height:.53, feed:6.1, cover:.77, rest:2.0, notice:'display'},
  crayfish:   {speed:1.05,stride:5.2, radius:.72, height:.52, feed:6.0, cover:.67, rest:1.7, notice:'display'},
  pomPom:     {speed:.62, stride:3.7, radius:.50, height:.44, feed:4.3, cover:.66, rest:1.5, sideways:1.17, notice:'display'},
  star:       {speed:.25, stride:2.8, radius:.43, height:.21, feed:3.3, cover:.35, rest:2.7},
  urchin:     {speed:.30, stride:3.2, radius:.43, height:.40, feed:3.8, cover:.56, rest:2.2, notice:'shy'},
  cucumber:   {speed:.23, stride:2.7, radius:.65, height:.29, feed:3.1, cover:.37, rest:2.8},
  featherStar:{speed:.30, stride:2.9, radius:.69, height:.67, feed:2.6, cover:.77, rest:4.3, filter:true, notice:'shy'},
  jelly:      {speed:.57, stride:5.8, radius:.89, height:1.25, feed:5.6, cover:0, rest:1.0, swim:true, drift:true},
};

const SEARCH_TURNS=[0,.35,-.35,.69,-.69,1.03,-1.03,1.43,-1.43,1.95,-1.95,Math.PI];
const OPENING_RANGES=[1,.53];
const SOCIAL=new Set(['retreat','display','approach','clean']);
const MOVING=new Set(['feed','roam','hop','retreat','approach']);

function leavesRoom(position,from,other,gap) {
  const distance=position.distanceToSquared(other);
  return distance>=gap*gap || Boolean(from && distance>from.distanceToSquared(other)+1e-6);
}

export function aquariumInvertebrateMotion(random,width,landmarks,food,options={}) {
  const {obstacles,visibleWidth=z=>width*(1-z/17.5),waterline=7.25,swimmers=[],current=.74,
    visitors,swimmingContacts}=options;
  const residents=[];
  const candidate=new THREE.Vector3(), middle=new THREE.Vector3(), a=new THREE.Vector3(), b=new THREE.Vector3();
  const best=new THREE.Vector3(), step=new THREE.Vector3(), mouth=new THREE.Vector3();
  const visitor=new THREE.Vector3();
  const bodyPosition=new THREE.Vector3(), bodyRotation=new THREE.Euler();
  const claims=new Set();
  const unclaimed=piece=>!claims.has(piece);

  function fit(position, animal, x, z, altitude=0) {
    z=THREE.MathUtils.clamp(z,-18.3,9.1);
    const edge=Math.max(.30,visibleWidth(z)*.95-animal.radius*.32);
    x=THREE.MathUtils.clamp(x,-edge,edge);
    return position.set(x,Math.min(waterline-animal.height*2,floorAt(x,z)+GROUND+Math.max(0,altitude)),z);
  }

  function clear(animal,from,to) {
    if (!obstacles) return true;
    const center=animal.profile.drift ? -animal.height*.48 : animal.height;
    a.copy(from); a.y+=center;
    b.copy(to); b.y+=center;
    return obstacles.clear(a,b,animal.radius,animal.height*.94);
  }

  function path(animal, from, to) {
    // A crawler follows the sand height even when the two ends of the path sit on a slope.
    if (!clear(animal,to,to)) return false;
    if (animal.profile.swim || animal.profile.hop) return clear(animal,from,to);
    fit(middle,animal,(from.x+to.x)*.5,(from.z+to.z)*.5);
    return clear(animal,from,middle) && clear(animal,middle,to);
  }

  function room(animal,position,others,from) {
    for (const other of residents) {
      if (animal===other || !other.node.visible) continue;
      if (!leavesRoom(position,from,other.node.position,(animal.radius+other.radius)*.97)) return false;
    }
    for (const {node} of others) {
      if (node.visible && !leavesRoom(position,from,node.position,animal.radius+node.scale.x*.36)) return false;
    }
    if (swimmingContacts) poseBody(animal,animal.trial,position);
    for (const node of swimmers) {
      if (!node.visible) continue;
      const other=swimmingContacts?.get(node);
      if (other && fishContactsOverlap(animal.trial,other.contact)) return false;
      if (!leavesRoom(position,from,node.position,animal.radius+node.scale.x*.44)) return false;
    }
    return true;
  }

  function poseBody(animal,contact,position) {
    bodyPosition.copy(position);
    bodyPosition.y+=animal.profile.drift ? -animal.height*.48 : animal.height;
    poseFishContact(contact,bodyPosition,bodyRotation);
  }

  function cruisingHeight(profile) {
    if (profile.drift) return 2.05+random()*2.33;
    if (profile.lift) return .11+random()*profile.lift;
    return profile.swim ? .49+random()*1.94 : 0;
  }

  function add(id,node,pose,shadow,x,z) {
    const profile=PROFILES[id];
    if (!profile) return false;
    const scale=node.scale.x;
    const animal={profile,node,pose,shadow,phase:random()*TAU,
      radius:profile.radius*scale,height:profile.height*scale*.5,speed:profile.speed*(.86+random()*.29),
      bearing:random()*TAU, turnRate:0, pace:0, clearance:Infinity, time:random()*2, rest:random()*(profile.hop ? 5 : 1.1),
      goal:new THREE.Vector3(), detour:new THREE.Vector3(), anchor:new THREE.Vector3(), bypass:0,
      trail:[], mode:'rest', idea:'roam', piece:null, seek:random()*.32, bite:0,
      span:0, timer:0, stalled:0, nearbyTime:0, observe:.28+random()*.34, warning:0,
      side:random()<.5 ? -1 : 1, attention:null,
    };
    const body={center:0,half:[animal.radius*.82,animal.height,animal.radius*.82]};
    animal.contact=fishContact(body,1);
    animal.trial=fishContact(body,1);
    animal.velocity=new THREE.Vector3();
    const altitude=cruisingHeight(profile);
    const {position}=node;
    fit(position,animal,x,z,altitude);
    let placed=clear(animal,position,position) && room(animal,position,[]);
    for (let i=0; !placed && i<48; i++) {
      const spread=.64+Math.floor(i/7)*.95;
      const angle=animal.bearing+i*2.39996;
      fit(position,animal,x+Math.cos(angle)*spread,z+Math.sin(angle)*spread,altitude);
      placed=clear(animal,position,position) && room(animal,position,[]);
    }
    // Try the rest of the tank when the nearest bank is covered by coral or other animals.
    for (let i=0; !placed && i<160; i++) {
      const depth=8.7-26.2*((animal.phase/TAU+i*.618034)%1);
      const across=2*((animal.phase/TAU*.41+i*.414214)%1)-1;
      fit(position,animal,across*visibleWidth(depth)*.89,depth,altitude);
      placed=clear(animal,position,position) && room(animal,position,[]);
    }
    node.visible=placed;
    node.rotation.y=-animal.bearing;
    animal.goal.copy(position);
    animal.anchor.copy(position);
    poseBody(animal,animal.contact,position);
    visitors?.push(animal);
    residents.push(animal);
    return true;
  }

  function choose(animal,day,others) {
    const {profile,node}=animal;
    const position=node.position;
    animal.trail.push(position.clone());
    if (animal.trail.length>5) animal.trail.shift();
    const preferCover=random()<profile.cover*(1+(1-day)*.65);
    let highest=-Infinity, idea='roam';
    for (let trial=0; trial<24; trial++) {
      const bank=preferCover && landmarks.length && trial<7 ? landmarks[Math.floor(random()*landmarks.length)] : null;
      const angle=animal.bearing+(trial+1)*2.39996+(random()-.5)*.8;
      const short=trial>=16;
      const distance=short ? .79+random()*1.33 : profile.stride*(.48+random()*.71);
      const altitude=cruisingHeight(profile);
      const x=bank ? bank.x+Math.cos(angle)*(bank.size*1.45+animal.radius+.8) : position.x+Math.cos(angle)*distance;
      const z=bank ? bank.z+Math.sin(angle)*(bank.size*1.31+animal.radius+.62) : position.z+Math.sin(angle)*distance;
      fit(candidate,animal,x,z,altitude);
      const length=position.distanceTo(candidate);
      if (length<(short ? .56 : Math.max(.64,profile.stride*.26)) || length>profile.stride*1.58 ||
        !path(animal,position,candidate) || !room(animal,candidate,others)) continue;
      let recent=0;
      for (const point of animal.trail) recent+=Math.max(0,1-candidate.distanceTo(point)/3.1);
      const approach=Math.atan2(candidate.z-position.z,candidate.x-position.x);
      const score=length*.28+Math.cos(approach-animal.bearing)*.37+random()*.45+(bank ? .46 : 0)-recent*.71;
      if (score<=highest) continue;
      highest=score;
      best.copy(candidate);
      idea=bank ? 'inspect' : 'roam';
    }
    if (highest===-Infinity) {
      if (findOpening(animal,others,animal.bearing+Math.PI*.79)) return true;
      restHere(animal,'inspect',.35+random()*.45);
      return false;
    }
    setCourse(animal,best,profile.hop ? 'hop' : 'roam',idea);
    return true;
  }

  function setCourse(animal,destination,mode,idea) {
    const position=animal.node.position;
    animal.goal.copy(destination);
    animal.span=Math.max(.3,position.distanceTo(destination));
    animal.mode=mode;
    animal.idea=idea;
    animal.timer=2.2+animal.span/animal.speed*1.67;
    animal.bypass=0;
    animal.stalled=0;
    animal.anchor.copy(position);
    animal.nearbyTime=0;
  }

  function restHere(animal,mode,seconds) {
    animal.mode=mode;
    animal.rest=seconds;
    animal.bypass=0;
  }

  function release(animal) {
    if (animal.piece) claims.delete(animal.piece);
    animal.piece=null;
  }

  function findOpening(animal,neighbours,bearing) {
    const position=animal.node.position;
    const {profile}=animal;
    const altitude=profile.swim ? Math.max(.13,position.y-floorAt(position.x,position.z)+.41) : 0;
    for (const range of OPENING_RANGES) {
      for (const turn of SEARCH_TURNS) {
        const angle=bearing+turn*animal.side;
        const span=(.65+animal.radius*.29)*range;
        fit(candidate,animal,position.x+Math.cos(angle)*span,position.z+Math.sin(angle)*span,altitude);
        if (position.distanceToSquared(candidate)<span*span*.52 || !path(animal,position,candidate) ||
          !room(animal,candidate,neighbours,position)) continue;
        setCourse(animal,candidate,'retreat','inspect');
        return true;
      }
    }
    return false;
  }

  function backAway(animal, other, neighbours) {
    const position=animal.node.position;
    release(animal);
    animal.seek=.83;
    const bearing=Math.atan2(position.z-other.position.z,position.x-other.position.x);
    const profile=animal.profile;
    const floor=floorAt(position.x,position.z);
    const altitude=profile.swim ? Math.max(.11,position.y-floor+(profile.lift ?? 0)*.61) : 0;
    for (const turn of SEARCH_TURNS) {
      const angle=bearing+turn*animal.side;
      const distance=1.17+animal.radius;
      fit(candidate,animal,position.x+Math.cos(angle)*distance,position.z+Math.sin(angle)*distance,altitude);
      if (position.distanceToSquared(candidate)<.5 || !path(animal,position,candidate) ||
        !room(animal,candidate,neighbours,position)) continue;
      setCourse(animal,candidate,'retreat','inspect');
      return;
    }
    if (!findOpening(animal,neighbours,bearing)) restHere(animal,'shelter',.66);
  }

  function observeNearby(animal,delta,neighbours) {
    if (!animal.profile.notice) return;
    animal.observe-=delta;
    animal.warning-=delta;
    if (animal.observe>0 || animal.warning>0) return;
    animal.observe=.32+random()*.22;
    const {node,profile,radius}=animal;
    const position=node.position;
    if (profile.notice==='clean') {
      if (animal.piece) return;
      let closest=10.2, guest=null;
      for (const fish of swimmers) {
        const distance=position.distanceToSquared(fish.position);
        if (!fish.visible || distance>=closest || fish.position.y-floorAt(fish.position.x,fish.position.z)>2.25) continue;
        closest=distance;
        guest=fish;
      }
      if (!guest) return;
      const distance=Math.sqrt(closest);
      const margin=radius+guest.scale.x*.53+.27;
      if (distance<=margin+.33) {
        animal.attention=guest;
        restHere(animal,'clean',.87);
      } else {
        visitor.copy(position).lerp(guest.position,Math.min(.68,(distance-margin)/distance));
        fit(candidate,animal,visitor.x,visitor.z,Math.max(.28,visitor.y-floorAt(visitor.x,visitor.z)));
        if (!path(animal,position,candidate) || !room(animal,candidate,neighbours)) return;
        animal.attention=guest;
        setCourse(animal,candidate,'approach','clean');
      }
      animal.warning=3.1+random()*1.3;
      return;
    }

    let intrusion=1, rival=null;
    for (const other of residents) {
      if (other===animal || !other.node.visible || other.profile.drift) continue;
      const reach=radius+other.radius+.47;
      const closeness=position.distanceToSquared(other.node.position)/(reach*reach);
      if (closeness>=intrusion) continue;
      intrusion=closeness;
      rival=other.node;
    }
    for (const fish of swimmers) {
      if (!fish.visible) continue;
      const reach=radius+fish.scale.x*.64+.51;
      const closeness=position.distanceToSquared(fish.position)/(reach*reach);
      if (closeness>=intrusion) continue;
      intrusion=closeness;
      rival=fish;
    }
    if (!rival) return;
    animal.attention=rival;
    animal.warning=2.1+random()*1.4;
    if (profile.notice==='display' && !swimmers.includes(rival) && !animal.piece) restHere(animal,'display',.54+random()*.24);
    else backAway(animal,rival,neighbours);
  }

  function sense(animal,delta,feeding) {
    const {profile,node}=animal;
    animal.seek-=delta;
    animal.bite=Math.max(0,animal.bite-delta);
    if (animal.piece && (!feeding || animal.piece.eaten || animal.piece.age>21 || animal.timer<=0)) {
      release(animal);
      restHere(animal,'inspect',.52+random()*.5);
      animal.seek=.65+random()*.60;
    }
    if (!feeding || animal.piece || animal.seek>0 || animal.bite>0 || SOCIAL.has(animal.mode)) return;
    animal.seek=.30+random()*.22;
    const kind=profile.hop || profile.filter ? 'sifter' : profile.swim && !profile.lift ? 'swimmer' : 'bed';
    const found=food.find(node.position,kind,profile.feed,Math.floor(animal.phase*9),unclaimed);
    if (!found) return;
    animal.piece=found;
    claims.add(found);
    animal.timer=profile.hop ? 1.8 : 4.8+profile.feed*.58;
    animal.mode=profile.hop ? 'inspect' : 'feed';
    animal.bypass=0;
    animal.stalled=0;
    animal.anchor.copy(node.position);
    animal.nearbyTime=0;
  }

  function steer(animal,goal,others) {
    const {node,profile}=animal;
    const position=node.position;
    const length=Math.hypot(goal.x-position.x,goal.z-position.z);
    const bearing=length>.035 ? Math.atan2(goal.z-position.z,goal.x-position.x) : animal.bearing;
    const look=.74+animal.radius*.69+Math.max(animal.speed,animal.pace)*.94;
    const flight=profile.swim || profile.hop;
    const forward=Math.min(look,Math.max(.70,length));
    const x=position.x+Math.cos(animal.bearing)*forward, z=position.z+Math.sin(animal.bearing)*forward;
    fit(candidate,animal,x,z,flight ? position.y-floorAt(x,z)-GROUND : 0);
    const center=profile.drift ? -animal.height*.48 : animal.height;
    a.copy(position); a.y+=center;
    b.copy(candidate); b.y+=center;
    animal.clearance=obstacles ? obstacles.clearance(a,b,animal.radius,animal.height*.94) : Infinity;
    const clearAhead=animal.clearance>forward*.95 && room(animal,candidate,others,position);

    if (animal.bypass>0 && position.distanceToSquared(animal.detour)>.19 &&
      clear(animal,position,animal.detour) && room(animal,animal.detour,others,position)) {
      return Math.atan2(animal.detour.z-position.z,animal.detour.x-position.x);
    }
    const reach=Math.min(length,look);
    if (profile.swim || profile.hop) candidate.copy(position).lerp(goal,length>.035 ? Math.min(1,reach/length) : 1);
    else fit(candidate,animal,position.x+Math.cos(bearing)*reach,position.z+Math.sin(bearing)*reach);
    if (clearAhead && clear(animal,position,candidate) && room(animal,candidate,others,position)) return bearing;
    let score=-Infinity, answer=animal.bearing;
    for (const turn of SEARCH_TURNS) {
      const angle=bearing+turn;
      const stride=Math.max(1.27+animal.radius*.80,look);
      fit(candidate,animal,position.x+Math.cos(angle)*stride,position.z+Math.sin(angle)*stride,
        profile.swim ? Math.max(.55,position.y-floorAt(position.x,position.z)) : 0);
      if (position.distanceToSquared(candidate)<.17 || !path(animal,position,candidate) || !room(animal,candidate,others)) continue;
      const value=-candidate.distanceTo(goal)*.67+Math.cos(angle-animal.bearing)*.81;
      if (value<=score) continue;
      score=value;
      animal.detour.copy(candidate);
      answer=angle;
    }
    if (score>-Infinity) {
      animal.bypass=.91;
      return answer;
    }
    return bearing;
  }

  function move(animal,delta,day,others) {
    const {node,profile,goal}=animal;
    const position=node.position;
    const bearing=steer(animal,goal,others);
    const turn=Math.atan2(Math.sin(bearing-animal.bearing),Math.cos(bearing-animal.bearing));
    const oldBearing=animal.bearing;
    const rate=THREE.MathUtils.clamp(turn*4.7,-3.8,3.8);
    animal.turnRate=THREE.MathUtils.damp(animal.turnRate,rate,8.5,delta);
    animal.bearing+=animal.turnRate*delta;
    const movingSideways=animal.mode==='roam' || animal.mode==='retreat';
    const facing=-animal.bearing+(movingSideways ? (profile.sideways ?? 0)*animal.side : 0);
    node.rotation.y+=Math.atan2(Math.sin(facing-node.rotation.y),Math.cos(facing-node.rotation.y))*Math.min(1,delta*4.8);
    const distance=position.distanceTo(goal);
    const driving=animal.speed*(.72+day*.28)*(animal.mode==='retreat' ? 1.85 : animal.mode==='feed' ? 1.31 : 1);
    const turning=1-Math.min(.37,Math.abs(turn)*.19);
    const braking=Math.sqrt(driving*5.0*Math.max(.016,animal.clearance-.06));
    const pace=Math.min(driving*turning,Math.max(driving*.32,braking),distance*3.5);
    animal.pace=THREE.MathUtils.damp(animal.pace,pace,4.2,delta);
    const travel=Math.min(distance,animal.pace*delta);
    const tangent=(oldBearing+animal.bearing)*.5;
    let moved=tryStep(animal,tangent,travel,distance,delta,others);
    const correction=THREE.MathUtils.clamp(turn,-.46,.46);
    if (!moved) moved=tryStep(animal,tangent+correction,travel*.75,distance,delta,others);
    if (!moved && animal.stalled>.13) {
      for (const turn of SEARCH_TURNS) {
        const angle=bearing+turn*animal.side;
        if (!tryStep(animal,angle,Math.max(delta*.24,travel*.76),distance,delta,others)) continue;
        moved=true;
        break;
      }
    }
    if (!moved) {
      animal.stalled+=delta;
      animal.pace=THREE.MathUtils.damp(animal.pace,0,6.4,delta);
      return;
    }
    animal.stalled=0;
    if (profile.swim || profile.hop) node.rotation.z+=(THREE.MathUtils.clamp((step.y-position.y)*9,-.20,.20)-node.rotation.z)*delta*4.5;
    position.copy(step);
  }

  function tryStep(animal,bearing,travel,distance,delta,others) {
    const {node,profile,goal}=animal;
    const position=node.position;
    const drift=profile.drift ? current*delta*(.11+.065*Math.sin(animal.time*.76+animal.phase)) : 0;
    const x=position.x+Math.cos(bearing)*travel+drift, z=position.z+Math.sin(bearing)*travel;
    let lift=0;
    if (profile.swim) {
      const wanted=THREE.MathUtils.clamp((goal.y-position.y)*delta*1.5,-travel*.8,travel*.8);
      const minimum=profile.drift ? 1.32 : profile.lift ? .08 : .32;
      lift=Math.max(minimum,position.y+wanted-floorAt(x,z)-GROUND);
    } else if (profile.hop) {
      const progress=1-Math.min(1,distance/animal.span);
      lift=.62*Math.sin(Math.PI*progress);
    }
    fit(step,animal,x,z,lift);
    return position.distanceToSquared(step)>1e-7 && clear(animal,position,step) && clear(animal,step,step) &&
      room(animal,step,others,position);
  }

  function animate(delta,day,others) {
    const feeding=food.active();
    for (const animal of residents) {
      if (!animal.node.visible) continue;
      const {node,profile,pose,goal,shadow}=animal;
      const position=node.position;
      animal.timer-=delta;
      animal.bypass-=delta;
      animal.rest-=delta;
      sense(animal,delta,feeding);
      observeNearby(animal,delta,others);
      if (animal.mode==='display' && animal.rest<=0 && animal.attention) backAway(animal,animal.attention,others);
      const piece=animal.piece;
      if (piece) {
        const feedingAltitude=profile.swim ? Math.max(profile.lift ? .08 : .32,piece.y-floorAt(piece.x,piece.z)-GROUND) : 0;
        if (!profile.hop) fit(goal,animal,piece.x,piece.z,feedingAltitude);
        const nose=animal.radius*.63;
        mouth.set(position.x+Math.cos(animal.bearing)*nose,position.y+animal.height*.58,position.z+Math.sin(animal.bearing)*nose);
        if (food.consume(piece,mouth,profile.hop ? .72 : .41+animal.radius*.21)) {
          release(animal);
          animal.seek=.95+random()*.65;
          animal.bite=.85;
          restHere(animal,'inspect',.7+random()*.7);
        }
      }
      let moving=MOVING.has(animal.mode);
      if (moving && position.distanceToSquared(animal.anchor)>.27) {
        animal.anchor.copy(position);
        animal.nearbyTime=0;
      }
      if (moving) animal.nearbyTime+=delta;
      const blocked=animal.stalled>.69 || animal.nearbyTime>2.2+.60/animal.speed;
      if (moving && blocked && !animal.piece && findOpening(animal,others,animal.bearing+animal.side*.73)) {
        animal.stalled=0;
      } else if (moving && (animal.timer<=0 || blocked || (!animal.piece &&
        position.distanceToSquared(goal)<Math.min(.065,animal.span*animal.span*.13)))) {
        if (animal.piece) animal.seek=1.2+random()*.74;
        release(animal);
        animal.stalled=0;
        const response=blocked ? 'inspect' : animal.idea;
        restHere(animal,response==='roam' ? 'rest' : response,blocked ? .42+random()*.43 : profile.rest*(.36+random()*.67));
        moving=false;
      }
      if (!moving && !animal.piece && animal.rest<=0) {
        moving=choose(animal,day,others);
      }
      if (moving) move(animal,delta,day,others);
      else {
        animal.pace*=Math.max(0,1-delta*4.8);
        animal.turnRate=THREE.MathUtils.damp(animal.turnRate,0,8.5,delta);
        const guest=animal.attention;
        if ((animal.mode==='clean' || animal.mode==='display') && guest?.visible) {
          const angle=Math.atan2(guest.position.z-position.z,guest.position.x-position.x);
          const turn=Math.atan2(Math.sin(-angle-node.rotation.y),Math.cos(-angle-node.rotation.y));
          node.rotation.y+=turn*Math.min(1,delta*4.8);
        }
        if (!profile.swim && position.y>floorAt(position.x,position.z)+GROUND) {
          fit(step,animal,position.x,position.z,Math.max(0,position.y-floorAt(position.x,position.z)-GROUND-delta*.91));
          if (clear(animal,position,step) && clear(animal,step,step) && room(animal,step,others,position)) position.copy(step);
        }
        node.rotation.z*=Math.max(0,1-delta*3.1);
      }
      if (shadow) shadow.position.y=(floorAt(position.x,position.z)-position.y+.018)/node.scale.y;
      if (visitors) {
        animal.velocity.copy(animal.contact.center);
        poseBody(animal,animal.contact,position);
        animal.velocity.subVectors(animal.contact.center,animal.velocity).multiplyScalar(delta>0 ? 1/delta : 0);
      }
      animal.time+=delta*(.49+Math.min(1.7,animal.pace)*1.08);
      pose(animal.time+animal.phase,day,animal.bite>0 || (profile.hop&&Boolean(animal.piece)),animal.mode,
        Math.min(1,animal.pace/animal.speed));
    }
  }

  return {add,animate};
}
