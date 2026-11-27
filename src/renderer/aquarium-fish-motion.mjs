import * as THREE from '../../node_modules/three/build/three.module.js';
import { floorAt } from './aquarium-habitat.mjs';
import { fishContact, fishContactsOverlap, poseFishContact } from './aquarium-fish-contact.mjs';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0,1,0);
const LANES = [
  [.87, 4.8], [.76,-10], [.18,-18], [-.82,-13], [-.89,2],
  [-.29,7.0], [.36,-3], [-.53,-15], [.81,-2], [-.03,5.0],
];
const DETOURS = [
  [0,.66], [0,-.49], [.48,0], [-.48,0], [.78,.46], [-.78,.46],
  [1.02,0], [-1.02,0], [1.49,0], [-1.49,0], [2.11,0], [-2.11,0],
  [1.26,-.43], [-1.26,-.43], [0,1.35], [0,-1.35],
  [2.65,.32], [-2.65,.32], [Math.PI,0],
];
const PASSING = [[1,.2],[-1,.2],[.40,.92],[-.40,.92],[.40,-.92],[-.40,-.92],[0,0]];
const ESCAPE_LEVELS = [.02,-.37,.43,-.84,.92,-1.45,1.45];
const ESCAPE_LENGTHS = [5.3,3.1,1.35,.46];
const LOOK_AHEAD = 1.65;
const angleBetween = (from,to) => Math.atan2(Math.sin(to-from),Math.cos(to-from));

const BEHAVIOUR = {
  // Shoal spacing, cruising height, acceleration, and surges differ across species.
  clown:     { spacing:1.04, level:.31, turn:3.2, surge:.28, patrol:5 },
  blackClown:{ spacing:1.13, level:.27, turn:2.8, surge:.22, patrol:6 },
  tang:      { spacing:1.77, level:.53, turn:2.5, surge:.27 },
  yellowTang:{ spacing:1.42, level:.40, turn:3.0, surge:.37 },
  anthias:   { spacing:.81, level:.61, turn:3.8, surge:.28, lane:3 },
  cardinal:  { spacing:.98, level:.36, turn:2.5, surge:.17, patrol:6, coast:.37 },
  sardine:   { spacing:.70, level:.74, turn:3.3, surge:.48 },
  rockfish:  { spacing:0, level:.26, turn:1.8, surge:.45, patrol:6, coast:.44 },
  tetra:     { spacing:.73, level:.43, turn:4.1, surge:.32 },
  discus:    { spacing:1.77, level:.47, turn:1.8, surge:.16 },
  cory:      { spacing:.91, level:.14, turn:3.2, surge:.45, bed:.18 },
  regal:     { spacing:1.68, level:.55, turn:2.1, surge:.19 },
  mandarin:  { spacing:0, level:.12, turn:3.6, surge:.36, bed:.37, coast:.46 },
  gramma:    { spacing:0, level:.32, turn:3.9, surge:.42, patrol:4, coast:.40 },
  flame:     { spacing:0, level:.36, turn:3.4, surge:.40, patrol:3 },
  butterfly: { spacing:1.38, level:.43, turn:2.9, surge:.24, patrol:3 },
  moorish:   { spacing:1.8, level:.57, turn:2.0, surge:.17 },
  guppy:     { spacing:1.01, level:.70, turn:3.2, surge:.34 },
  betta:     { spacing:0, level:.66, turn:2.0, surge:.36, patrol:4, coast:.47 },
  rummy:     { spacing:.65, level:.36, turn:4.7, surge:.36 },
  goldfish:  { spacing:1.49, level:.52, turn:2.2, surge:.19 },
  angel:     { spacing:1.52, level:.53, turn:1.9, surge:.16, patrol:3, coast:.38 },
  koi:       { spacing:2.05, level:.67, turn:1.7, surge:.22 },
  ray:       { spacing:2.4, level:.15, turn:1.47, surge:.14, bed:.42 },
};

export function makeFishMotion(width, landmarks, food, options = {}) {
  const { visibleWidth = z=>width*(1-z/17.5), waterline = 7.25, obstacles, visitors = [], swimmingContacts } = options;
  const actors = [];
  const target = new THREE.Vector3(), probe = new THREE.Vector3(), step = new THREE.Vector3();
  const steer = new THREE.Vector3(), offset = new THREE.Vector3(), mouth = new THREE.Vector3();
  const axis = new THREE.Vector3(), lateral = new THREE.Vector3();
  const avoidance = new THREE.Vector3(), dodge = new THREE.Vector3(), angles = new THREE.Euler(0,0,0,'YZX');
  const translated = new THREE.Vector3(), tangent = new THREE.Vector3(), relative = new THREE.Vector3();
  const approach = new THREE.Vector3();
  const claims = new Set();
  let time = 0;

  function isAvailable(piece) {
    if (claims.has(piece)) return false;
    let nearby=0;
    for (const reserved of claims) {
      if (reserved.eaten) continue;
      const dx=piece.x-reserved.x, dy=piece.y-reserved.y, dz=piece.z-reserved.z;
      if (dx*dx+dy*dy+dz*dz<5.76 && ++nearby>=4) return false;
    }
    return true;
  }

  function within(out, fish) {
    out.z = THREE.MathUtils.clamp(out.z,-20.5,8.0);
    const edge = Math.max(.35,visibleWidth(out.z) * .99 - fish.radius*.46);
    out.x = THREE.MathUtils.clamp(out.x,-edge,edge);
    out.y = THREE.MathUtils.clamp(out.y,floorAt(out.x,out.z)+fish.height,waterline-fish.height*.79);
    return out;
  }

  function free(from, to, fish) {
    return !obstacles || obstacles.clear(from,to,fish.radius,fish.height);
  }

  function clearContact(contact, destination) {
    const {x,y,z}=contact.bounds;
    return !obstacles || obstacles.clear(contact.center,destination,x,y,z);
  }

  function clearTranslation(fish,destination) {
    translated.subVectors(destination,fish.mesh.position).add(fish.contact.center);
    return clearContact(fish.contact,translated);
  }

  function forwardClearance(fish,destination) {
    if (!obstacles) return Infinity;
    const {x,y,z}=fish.contact.bounds;
    translated.subVectors(destination,fish.mesh.position).add(fish.contact.center);
    return obstacles.clearance(fish.contact.center,translated,x,y,z);
  }

  function lane(out, fish, index) {
    const [side,z] = LANES[index % LANES.length];
    const height = fish.behaviour.bed !== undefined ? floorAt(side*visibleWidth(z),z)+fish.height+fish.behaviour.bed
      : waterline*(fish.behaviour.level + .10*Math.sin(index*2.28+fish.phase));
    return within(out.set(side*visibleWidth(z),height,z + fish.depthOffset),fish);
  }

  function positionNearHome(out, fish, visit) {
    const angle = fish.phase + visit*2.11;
    const span = fish.home.size + 1.8;
    return within(out.set(fish.home.x + Math.cos(angle)*span,
      waterline*fish.behaviour.level + Math.sin(angle*.61)*.53,
      fish.home.z + fish.home.size*.93 + Math.sin(angle)*span),fish);
  }

  function openPosition(position, fish) {
    if (free(position,position,fish)) return true;
    const start = position.y;
    for (let height=start+.42; height<waterline; height+=.57) {
      within(position.setY(height),fish);
      if (free(position,position,fish)) return true;
    }
    position.y=start;
    return false;
  }

  function nextGoal(fish) {
    for (let attempt=0; attempt<LANES.length; attempt++) {
      const period = fish.behaviour.patrol;
      if (period && fish.visits++ % period >= 2) positionNearHome(fish.goal,fish,fish.visits);
      else lane(fish.goal,fish,fish.lane++);
      if (openPosition(fish.goal,fish)) return;
    }
    fish.goal.copy(fish.mesh.position);
  }

  function contactClear(fish, contact) {
    for (const other of actors) {
      if (other!==fish && other.mesh.visible && fishContactsOverlap(contact,other.contact)) return false;
    }
    for (const other of visitors) {
      if (other.node.visible && fishContactsOverlap(contact,other.contact)) return false;
    }
    return true;
  }

  function spawnPosition(fish, position) {
    if (!openPosition(position,fish)) return false;
    poseFishContact(fish.contact,position,fish.mesh.rotation);
    return clearContact(fish.contact,fish.contact.center) && contactClear(fish,fish.contact);
  }

  function spawn(fish) {
    const position=fish.mesh.position;
    if (fish.leader) {
      formation(position,fish);
      fish.heading.copy(fish.leader.heading);
    } else if (fish.behaviour.patrol && fish.home.size > 0) {
      positionNearHome(position,fish,fish.index);
    } else lane(position,fish,fish.lane++);
    nextGoal(fish);
    if (!fish.leader) fish.heading.subVectors(fish.goal,position).normalize();
    fish.mesh.rotation.set(0,-Math.atan2(fish.heading.z,fish.heading.x),0,'YZX');
    const origin=position.clone();
    let placed=spawnPosition(fish,position);
    for (let i=0; !placed && i<48; i++) {
      const band=.6+fish.contact.half[2]+Math.floor(i/8)*.62;
      const bearing=fish.phase+i*2.39996;
      const lift=(i%5-2)*.43;
      within(position.set(origin.x+Math.cos(bearing)*band,origin.y+lift,origin.z+Math.sin(bearing)*band),fish);
      placed=spawnPosition(fish,position);
    }
    for (let i=0; !placed && i<LANES.length; i++) {
      lane(position,fish,fish.lane++);
      placed=spawnPosition(fish,position);
    }
    // Search the full water volume when a narrow or heavily stocked tank fills the preferred lanes.
    const start=fish.phase/TAU;
    for (let i=0; !placed && i<144; i++) {
      const depth=(start+i*.618033989)%1;
      const side=(start*.41+i*.414213562)%1;
      const level=(start*.65+i*.732050808)%1;
      const z=7.8-depth*28;
      within(position.set((side*2-1)*visibleWidth(z)*.96,waterline*(.17+level*.80),z),fish);
      placed=spawnPosition(fish,position);
    }
    fish.mesh.visible=placed;
    fish.checkpoint.copy(position);
  }

  function formation(out, fish) {
    const leader=fish.leader;
    const behind=Math.floor((fish.slot+1)/2);
    const side=fish.slot%2 ? -1 : 1;
    const spacing=fish.behaviour.spacing;
    lateral.set(-leader.heading.z,0,leader.heading.x).normalize();
    return within(out.copy(leader.mesh.position)
      .addScaledVector(leader.heading,-spacing*(behind*.92+.20))
      .addScaledVector(lateral,side*spacing*(.70+(behind%3)*.22) + Math.sin(time*.86+fish.phase)*.23)
      .addScaledVector(UP,spacing*(.45*Math.sin(fish.slot*2.39)+.13*Math.sin(time+fish.phase))),fish);
  }

  function add(id, species, meshes, random, body) {
    const behaviour=BEHAVIOUR[id];
    const banks=landmarks.filter(bank=>bank.plane==='front');
    const homes=banks.length ? [...banks,...landmarks.filter(bank=>bank.plane!=='front')] : landmarks;
    const count=meshes.length;
    // Territorial species roam singly or in pairs; pelagic fish can keep larger shoals.
    const capacity=behaviour.spacing ? (behaviour.patrol ? 2 : ['tang','koi','goldfish'].includes(id) ? 3 : count) : 1;
    const squad=[];
    for (const [index,mesh] of meshes.entries()) {
      if (index%capacity===0) squad.length=0;
      const scale=mesh.scale.x;
      const phase=random()*TAU;
      const home=homes[(species.pattern + Math.floor(index/capacity)*3)%homes.length] ?? { x:0,z:-3,size:0 };
      const fish={
        mesh, species, behaviour, phase, index, home, slot:squad.length, leader:squad[0], followers:[],
        contact:fishContact(body.contact,scale), trial:fishContact(body.contact,scale),
        heading:new THREE.Vector3(1,0,0), pace:0,
        avoidance:new THREE.Vector3(), previousCenter:new THREE.Vector3(), velocity:new THREE.Vector3(),
        passing:null, passSide:1, passLift:1, passingRisk:0,
        goal:new THREE.Vector3(), detour:new THREE.Vector3(), checkpoint:new THREE.Vector3(),
        escapeOrigin:new THREE.Vector3(), escapeGoal:new THREE.Vector3(), escapeUntil:0, planAfter:0, escapeReady:false,
        reroute:0, checkpointAge:0, yielding:0, clearance:Infinity,
        visits:behaviour.patrol ? 2+index%behaviour.patrol : 0,
        lane:((behaviour.lane ?? species.pattern) + Math.floor(index/capacity)*4)%LANES.length,
        depthOffset:(random()-.5)*1.7,
        radius:scale*body.radius+.06, height:scale*body.height+.06, nose:scale*body.nose,
        cruise:(.92+species.speed*1.77)*(.91+random()*.18),
        seek:random()*.22, pause:0, bite:0, piece:null, pursueUntil:0,
      };
      spawn(fish);
      if (fish.leader) fish.leader.followers.push(fish);
      actors.push(fish);
      swimmingContacts?.set(mesh,fish);
      squad.push(fish);
    }
  }

  function releaseFood(fish) {
    claims.delete(fish.piece);
    fish.piece=null;
  }

  function watchProgress(fish, delta) {
    const position=fish.mesh.position;
    const neighbourhood=1.07+fish.contact.half[0]*.39;
    if (fish.checkpoint.distanceToSquared(position)>neighbourhood*neighbourhood) {
      fish.checkpointAge=0;
      fish.checkpoint.copy(position);
      return;
    }
    fish.checkpointAge+=delta;
    if (fish.checkpointAge < 2.9+fish.phase*.07) return;
    if (time>=fish.escapeUntil) fish.escapeOrigin.copy(fish.checkpoint);
    fish.escapeUntil=time+4.4+fish.phase*.11;
    fish.escapeReady=false;
    fish.planAfter=0;
    fish.reroute=0;
    fish.pause=0;
    releaseFood(fish);
    fish.seek=4.7+fish.phase*.11;
    if (!fish.leader) nextGoal(fish);
    fish.checkpoint.copy(position);
    fish.checkpointAge=0;
  }

  function planEscape(fish) {
    const {mesh,escapeOrigin,escapeGoal}=fish;
    const position=mesh.position;
    let best=-Infinity;
    // Try full courses first and use a nearer opening only when the surroundings are tight.
    for (const length of ESCAPE_LENGTHS) {
      for (let bearing=0; bearing<10; bearing++) {
        const angle=fish.phase*.31+bearing*TAU/10+time*.49;
        for (const pitch of ESCAPE_LEVELS) {
          const horizontal=Math.cos(pitch)*length;
          within(probe.set(position.x+Math.cos(angle)*horizontal,position.y+Math.sin(pitch)*length,
            position.z+Math.sin(angle)*horizontal),fish);
          const span=position.distanceTo(probe);
          if (span<.28 || !clearTranslation(fish,probe)) continue;
          step.copy(position).lerp(probe,Math.min(.36/span,1));
          poseFishContact(fish.trial,step,mesh.rotation);
          if (!contactClear(fish,fish.trial)) continue;
          let crowd=0;
          for (const other of actors) {
            if (other!==fish && other.mesh.visible && probe.distanceToSquared(other.mesh.position)<6.25) crowd++;
          }
          const edge=visibleWidth(probe.z);
          const score=probe.distanceTo(escapeOrigin)+.28*span-.87*crowd
            -.55*Math.abs(probe.x)/edge-.19*Math.abs(probe.y-waterline*.55);
          if (score<=best) continue;
          best=score;
          escapeGoal.copy(probe);
        }
      }
      if (best>-Infinity) break;
    }
    fish.escapeReady=best>-Infinity;
    fish.planAfter=time+.29;
    fish.yielding=0;
  }

  function setTarget(fish, feeding, delta, day) {
    const position=fish.mesh.position;
    fish.pause=Math.max(0,fish.pause-delta);
    fish.bite=Math.max(0,fish.bite-delta);
    fish.seek-=delta;
    if (time<fish.escapeUntil) {
      if (time>=fish.planAfter && (!fish.escapeReady || position.distanceToSquared(fish.escapeGoal)<.07)) planEscape(fish);
      if (fish.escapeReady) return target.copy(fish.escapeGoal);
    }
    const bottom=fish.behaviour.bed !== undefined;
    if (fish.piece && (!feeding || fish.piece.eaten || fish.piece.age>21 || time>fish.pursueUntil
      || (!bottom && (fish.piece.grounded || fish.piece.y-fish.piece.bed<.62)))) releaseFood(fish);
    if (feeding && time>=fish.escapeUntil && fish.seek<=0 && !fish.pause && !fish.piece) {
      fish.seek=.26+(fish.index%4)*.047;
      fish.piece=food.find(position,bottom ? 'bed' : 'swimmer',
        (10+width*.55)*(.74+day*.26),fish.index+fish.species.pattern,isAvailable);
      if (fish.piece) {
        claims.add(fish.piece);
        const {x,y,z}=fish.piece;
        fish.pursueUntil=time+2.8+Math.hypot(x-position.x,y-position.y,z-position.z)/fish.cruise;
      }
    }
    if (fish.piece) {
      const {x,y,z}=fish.piece;
      target.set(x,y,z);
      // The body stops just behind the bite instead of trying to swim through it.
      offset.subVectors(target,position);
      const distance=offset.length();
      if (distance>fish.nose+.12) target.addScaledVector(offset,-fish.nose*.68/distance);
      return within(target,fish);
    }
    if (fish.leader?.mesh.visible) {
      formation(target,fish);
      if (!openPosition(target,fish)) return lane(target,fish,fish.lane);
      return within(target,fish);
    }
    if (fish.goal.distanceToSquared(position)<1.56) {
      if (fish.behaviour.coast) fish.pause=fish.behaviour.coast*(1+Math.sin(time+fish.phase)*.44);
      nextGoal(fish);
    }
    target.copy(fish.goal);
    target.y+=Math.sin(time*(.72+fish.species.speed*.32)+fish.phase)*.25;
    if (fish.behaviour.bed !== undefined) {
      const fraction=THREE.MathUtils.clamp(1.6/Math.max(.001,position.distanceTo(target)),0,1);
      const x=THREE.MathUtils.lerp(position.x,target.x,fraction), z=THREE.MathUtils.lerp(position.z,target.z,fraction);
      target.set(x,Math.max(floorAt(x,z)+fish.height+fish.behaviour.bed,Math.min(fish.goal.y,position.y+.45)),z);
    }
    return within(target,fish);
  }

  function passRisk(fish, other, speed) {
    const {contact,velocity}=other;
    const center=other.previousCenter ?? contact.center;
    offset.subVectors(center,fish.previousCenter);
    const reach=fish.contact.radius+contact.radius;
    const ahead=offset.dot(approach);
    if (ahead < -reach*.48) return 0;
    const horizon=reach+(speed+velocity.length())*LOOK_AHEAD+.85;
    if (offset.lengthSq()>horizon*horizon) return 0;
    relative.copy(velocity).addScaledVector(approach,-speed);
    const closing=-offset.dot(relative);
    // Parallel members of the same shoal need just enough room to hold formation.
    const shoal=(fish.leader ?? fish)===(other.leader ?? other) && fish.heading.dot(other.heading)>.55;
    const encounter=THREE.MathUtils.clamp(closing/Math.max(.001,relative.lengthSq()),0,LOOK_AHEAD);
    const silhouette=shoal || fish.piece ? 0 : silhouetteRisk(fish.contact,contact);
    if (closing<=0 && (shoal || ahead>reach*.66)) return silhouette;
    offset.addScaledVector(relative,encounter);
    const spacing=fish.contact.half[2]+contact.half[2]+(shoal ? .22 : .77);
    const height=fish.contact.bounds.y+contact.bounds.y+(shoal ? .14 : .63);
    const separation=Math.hypot(offset.dot(lateral)/spacing,offset.y/height,offset.dot(approach)/(reach+.50));
    const collision=Math.max(0,1-separation)*(1-encounter*.24)*(shoal ? .62 : 1);
    return Math.max(collision,silhouette);
  }

  function silhouetteRisk(contact, other) {
    // Nearby depth layers can cover each other in the front view without touching in the tank.
    if (Math.abs(offset.z)>3.8+Math.abs(relative.z)*LOOK_AHEAD) return 0;
    const distance=17.5-contact.center.z;
    const side=(contact.center.x-.22)/distance, level=(contact.center.y-waterline*.56)/distance;
    const dx=offset.x+offset.z*side, dy=offset.y+offset.z*level;
    const vx=relative.x+relative.z*side, vy=relative.y+relative.z*level;
    const closing=-(dx*vx+dy*vy);
    const encounter=THREE.MathUtils.clamp(closing/Math.max(.001,vx*vx+vy*vy),0,LOOK_AHEAD);
    const width=contact.bounds.x+other.bounds.x+.19;
    const height=contact.bounds.y+other.bounds.y+.27;
    const separation=Math.hypot((dx+vx*encounter)/width,(dy+vy*encounter)/height,(offset.z+relative.z*encounter)/3.8);
    return Math.max(0,1-separation)*.94*(1-encounter*.21);
  }

  function yieldToFish(fish, course, delta) {
    approach.copy(fish.heading).lerp(course,.28).normalize();
    lateral.set(-approach.z,0,approach.x).normalize();
    const speed=Math.max(fish.pace,fish.cruise*.44);
    let threat=null, priority=.045, risk=0;
    for (let i=0; i<actors.length+visitors.length; i++) {
      const other=i<actors.length ? actors[i] : visitors[i-actors.length];
      if (other===fish || !(other.mesh ?? other.node).visible) continue;
      const candidate=passRisk(fish,other,speed);
      const score=candidate*(other===fish.passing ? 1.28 : 1);
      if (score<=priority) continue;
      threat=other;
      risk=candidate;
      priority=score;
    }
    avoidance.set(0,0,0);
    if (threat) {
      const {center}=threat.contact;
      const position=fish.mesh.position;
      if (fish.passing!==threat) {
        offset.subVectors(threat.previousCenter ?? center,fish.previousCenter);
        const across=offset.dot(lateral);
        // Keep the chosen side until the pass clears so a near head-on course cannot oscillate.
        fish.passSide=across>.28 ? -1 : 1;
        const otherId=(threat.mesh ?? threat.node).id;
        const viewHeight=offset.y+offset.z*(fish.previousCenter.y-waterline*.56)/(17.5-fish.previousCenter.z);
        fish.passLift=Math.abs(viewHeight)>.14 ? -Math.sign(viewHeight) : fish.mesh.id<otherId ? 1 : -1;
        const roomUp=waterline-position.y-fish.height*.79;
        const roomDown=position.y-floorAt(position.x,position.z)-fish.height;
        if (fish.passLift>0 ? roomUp<.54 : roomDown<.54) fish.passLift*=-1;
      }
      avoidance.copy(lateral).multiplyScalar(fish.passSide*risk*1.48);
      avoidance.y=fish.passLift*risk*(fish.behaviour.bed===undefined ? 1.61 : .48);
    }
    fish.passing=threat;
    fish.passingRisk=THREE.MathUtils.damp(fish.passingRisk,risk,7,delta);
    fish.avoidance.lerp(avoidance,1-Math.exp(-(threat ? 6.5 : 3.5)*delta));
    course.add(fish.avoidance).normalize();
  }

  function direction(fish, delta) {
    const position=fish.mesh.position;
    const escaping=time<fish.escapeUntil && fish.escapeReady;
    const ahead=1.10+fish.pace*.85;
    within(probe.copy(position).addScaledVector(fish.heading,ahead),fish);
    fish.clearance=forwardClearance(fish,probe);
    fish.reroute-=delta;
    const detouring=!escaping && fish.reroute>0 && fish.detour.distanceToSquared(position)>.27 && free(position,fish.detour,fish);
    axis.subVectors(detouring ? fish.detour : target,position);
    const distance=axis.length();
    if (distance<.015) axis.copy(fish.heading);
    else axis.multiplyScalar(1/distance);
    steer.copy(axis);
    yieldToFish(fish,axis,delta);
    const look=Math.min(distance,1.56+fish.pace*.83);
    within(probe.copy(position).addScaledVector(axis,look),fish);
    if (escaping || detouring) return free(position,probe,fish) ? steer.copy(axis) : steer;
    if (fish.clearance>ahead*.87 && free(position,probe,fish)) {
      fish.reroute=0;
      return steer.copy(axis);
    }

    const angle=Math.atan2(axis.z,axis.x);
    const span=3.05;
    let best=-Infinity;
    steer.copy(fish.heading);
    for (const [turn,pitch] of DETOURS) {
      const bearing=angle+turn;
      within(probe.set(position.x+Math.cos(bearing)*Math.cos(pitch)*span,position.y+Math.sin(pitch)*span,
        position.z+Math.sin(bearing)*Math.cos(pitch)*span),fish);
      offset.subVectors(probe,position);
      let length=offset.length();
      if (length<.75) continue;
      if (!free(position,probe,fish)) {
        probe.lerp(position,.61);
        if (!free(position,probe,fish)) continue;
        offset.subVectors(probe,position);
        length=offset.length();
      }
      offset.multiplyScalar(1/length);
      const score=offset.dot(axis)*1.22+offset.dot(fish.heading)*.58+probe.distanceTo(position)*.17
        - Math.abs(pitch)*(fish.behaviour.bed !== undefined ? .38 : .13);
      if (score<=best) continue;
      best=score;
      fish.detour.copy(probe);
      steer.copy(offset);
    }
    fish.reroute=best===-Infinity ? 0 : .88;
    return steer;
  }

  function move(fish, course, length, yaw, pitch, roll) {
    const {mesh}=fish;
    const position=mesh.position;
    within(step.copy(position).addScaledVector(course,length),fish);
    // An animal at a coral edge can back out using its oriented body when searching for an opening.
    if (time>=fish.escapeUntil && !free(position,step,fish) && free(position,position,fish)) return false;
    angles.set(roll,yaw,pitch);
    poseFishContact(fish.trial,step,angles);
    if (!clearTranslation(fish,step) || !clearContact(fish.trial,fish.trial.center)) return false;
    if (!contactClear(fish,fish.trial)) return false;
    position.copy(step);
    mesh.rotation.copy(angles);
    const previous=fish.contact;
    fish.contact=fish.trial;
    fish.trial=previous;
    return true;
  }

  function advance(fish, delta, day) {
    const { mesh, behaviour, piece }=fish;
    const position=mesh.position;
    const distance=position.distanceTo(target);
    const turn=direction(fish,delta);
    const {x:rollNow,y:yawNow,z:pitchNow}=mesh.rotation;
    const heading=fish.heading;
    tangent.copy(heading);
    const response=1-Math.exp(-delta*(behaviour.turn + (piece ? 1.6 : 0)));
    if (heading.dot(turn)<-.94) heading.applyAxisAngle(UP,delta*(fish.index%2 ? -1 : 1)*behaviour.turn);
    heading.lerp(turn,response).normalize();
    tangent.add(heading).normalize();
    const surge=1+behaviour.surge*Math.sin(time*(.8+fish.species.speed*.59)+fish.phase)*.60;
    const escaping=time<fish.escapeUntil && fish.escapeReady;
    let pace=fish.cruise*(.55+day*.45)*surge;
    if (piece) pace*=1.38;
    if (fish.leader && !piece && !escaping) pace *= THREE.MathUtils.clamp(.76 + distance*.39,.26,1.73);
    if (!piece && !escaping && fish.followers.length) {
      let lag=0;
      for (const member of fish.followers) {
        if (member.mesh.visible && !member.piece) lag=Math.max(lag,position.distanceToSquared(member.mesh.position));
      }
      pace*=THREE.MathUtils.clamp(1.25-Math.sqrt(lag)*.087,.53,1);
    }
    if (fish.reroute<=0 || fish.pause) pace *= Math.min(1,distance*(piece ? 2.8 : 1.1));
    if (fish.pause) pace*=.29;
    if (!escaping) {
      pace*=.64+.36*Math.max(0,heading.dot(turn));
      const braking=Math.sqrt(fish.cruise*4.4*Math.max(.022,fish.clearance-.10));
      pace=Math.min(pace,Math.max(pace*.42,braking));
    }
    pace*=1-(piece ? .27 : .46)*fish.passingRisk;
    fish.pace=THREE.MathUtils.damp(fish.pace,pace,pace<fish.pace ? 4.8 : 3.4,delta);

    if (escaping) tangent.lerp(turn,.64).normalize();
    const yawDelta=angleBetween(yawNow,-Math.atan2(tangent.z,tangent.x));
    const turnStep=yawDelta*(1-Math.exp(-delta*(behaviour.turn+4)));
    const bite=Math.sin(fish.bite*24)*.13*fish.bite/.36;
    const pitch=THREE.MathUtils.damp(pitchNow,THREE.MathUtils.clamp(Math.asin(tangent.y)*.75,-.62,.62)+bite,8,delta);
    const roll=THREE.MathUtils.damp(rollNow,
      THREE.MathUtils.clamp(yawDelta*.63,-.32,.32)+.044*Math.sin(time*2.5+fish.phase),7,delta);
    const stride=Math.min(distance+.04,fish.pace*delta);
    if (move(fish,tangent,stride,yawNow+turnStep,pitch,roll)) {
      fish.yielding=Math.max(0,fish.yielding-delta*.62);
      return;
    }

    // Yield at close quarters, keeping the current orientation if a turn would overlap.
    fish.yielding+=delta;
    if (piece && fish.yielding>.62) {
      releaseFood(fish);
      fish.seek=1+(fish.index%4)*.17;
    }
    fish.pace=THREE.MathUtils.damp(fish.pace,fish.pace*.47,6.2,delta);
    if (!escaping && move(fish,tangent.lerp(turn,.38).normalize(),stride*.68,
      yawNow+turnStep*.56,THREE.MathUtils.lerp(pitchNow,pitch,.48),THREE.MathUtils.lerp(rollNow,roll,.48))) return;
    if (move(fish,turn,stride*(escaping ? .93 : .45),yawNow,pitchNow,rollNow)) return;
    if (escaping && fish.yielding>.38) {
      fish.escapeReady=false;
      fish.planAfter=time+.12;
    }
    const side=fish.index%2 ? -1 : 1;
    const easing=Math.max(stride*.57,delta*Math.min(.79,.28+fish.yielding*1.6));
    for (const [across,up] of PASSING) {
      dodge.set(-turn.z*across*side,up,turn.x*across*side);
      if (!across) dodge.copy(turn).negate();
      if (!move(fish,dodge.normalize(),easing,yawNow,pitchNow,rollNow)) continue;
      if (!escaping && fish.yielding>.09) {
        within(fish.detour.copy(position).addScaledVector(dodge,1.38),fish);
        fish.reroute=.49;
      }
      break;
    }
  }

  function tick(delta, day) {
    time+=delta;
    const feeding=food.active();
    for (const fish of actors) {
      fish.previousCenter.copy(fish.contact.center);
    }
    for (const fish of actors) {
      if (!fish.mesh.visible) continue;
      watchProgress(fish,delta);
      setTarget(fish,feeding,delta,day);
      advance(fish,delta,day);
      const { mesh, piece }=fish;
      if (piece) {
        const {nose}=fish;
        mouth.set(nose,0,0).applyEuler(mesh.rotation).add(mesh.position);
        if (food.consume(piece,mouth,.38+mesh.scale.x*.19) || food.consume(piece,mesh.position,.31)) {
          fish.bite=.36;
          fish.pause=.24+(fish.index%4)*.042;
          fish.seek=.74+(fish.index%4)*.16;
          releaseFood(fish);
        }
      }
    }
    const velocityResponse=1-Math.exp(-8*delta);
    for (const fish of actors) {
      if (fish.mesh.visible) fish.velocity.lerp(offset.subVectors(fish.contact.center,fish.previousCenter)
        .multiplyScalar(1/delta),velocityResponse);
    }
  }

  function draw(delta, day) {
    const seconds=Math.min(delta,.12);
    if (seconds<=0) return;
    const steps=Math.ceil(seconds/(1/30));
    for (let i=0; i<steps; i++) tick(seconds/steps,day);
  }

  return { add, draw };
}
