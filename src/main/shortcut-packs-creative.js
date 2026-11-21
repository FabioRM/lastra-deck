// @ts-check
'use strict';

const { desktopPack: pack, usKey } = require('./shortcut-pack-data');

module.exports = [
  pack('audition', 'Adobe Audition', ['adobe audition.exe'], 'https://helpx.adobe.com/audition/desktop/keyboard-shortcuts/default-keyboard-shortcuts.html', [
    ['save', 'Save audio or session', 'save', 'Ctrl+S'],
    ['open-file', 'Open audio file', 'folder-open', 'Ctrl+O'],
    ['play-pause', 'Start or stop playback', 'circle-play', 'Space'],
    ['switch-editor', 'Toggle editor mode', 'audio-waveform', '1'],
  ]),
  pack('indesign', 'Adobe InDesign', ['indesign.exe'], 'https://helpx.adobe.com/indesign/using/default-keyboard-shortcuts.html', [
    ['place', 'Place file', 'file-input', 'Ctrl+D'],
    ['export', 'Export document', 'file-output', 'Ctrl+E'],
    ['pages', 'Pages panel', 'files', 'F12'],
    ['fit-page', 'Fit page in window', 'maximize', 'Ctrl+0'],
  ]),
  pack('adobe-bridge', 'Adobe Bridge', ['bridge.exe'], 'https://helpx.adobe.com/bridge/using/adobe-bridge-keyboard-shortcuts.html', [
    ['find', 'Find files', 'search', 'Ctrl+F'],
    ['new-folder', 'New folder', 'folder-plus', 'Ctrl+Shift+N'],
    ['batch-rename', 'Batch rename', 'pencil', 'Ctrl+Shift+R'],
    ['full-preview', 'Full-screen preview', 'maximize', 'Space'],
  ], { editing: false }),
  pack('adobe-media-encoder', 'Adobe Media Encoder', ['adobe media encoder.exe'], 'https://helpx.adobe.com/media-encoder/desktop/encoding-quick-start-and-basics/default-keyboard-shortcuts.html', [
    ['add-source', 'Add source', 'file-plus', 'Ctrl+I'],
    ['save-queue', 'Save queue', 'save', 'Ctrl+S'],
    ['duplicate', 'Duplicate queue item', 'copy', 'Ctrl+D'],
  ], { editing: false }),
  pack('adobe-animate', 'Adobe Animate', ['animate.exe'], 'https://helpx.adobe.com/animate/using/keyboard-shortcuts.html', [
    ['save', 'Save animation', 'save', 'Ctrl+S'],
    ['insert-frame', 'Insert frame', 'square-plus', 'F5'],
    ['insert-keyframe', 'Insert keyframe', 'diamond-plus', 'F6'],
    ['blank-keyframe', 'Blank keyframe', 'diamond', 'F7'],
  ]),
  pack('gimp', 'GIMP', ['gimp-3.0.exe', 'gimp-2.10.exe', 'gimp.exe'], 'https://docs.gimp.org/3.0/en/gimp-help.html', [
    ['open-layers', 'Open as layers', 'layers', 'Ctrl+Alt+O'],
    ['export', 'Export as', 'file-output', 'Ctrl+Shift+E'],
    ['deselect', 'Deselect', 'square-dashed', 'Ctrl+Shift+A'],
    ['invert-selection', 'Invert selection', 'contrast', 'Ctrl+I'],
  ]),
  pack('inkscape', 'Inkscape', ['inkscape.exe'], 'https://inkscape.org/doc/keys.html', [
    ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D'],
    ['group', 'Group selection', 'group', 'Ctrl+G'],
    ['ungroup', 'Ungroup selection', 'ungroup', 'Ctrl+Shift+G'],
    ['object-to-path', 'Object to path', 'spline', 'Ctrl+Shift+C'],
    ['export', 'Export panel', 'file-output', 'Ctrl+Shift+E'],
  ]),
  pack('krita', 'Krita', ['krita.exe'], 'https://docs.krita.org/en/reference_manual/preferences/shortcut_settings.html', [
    ['save', 'Save painting', 'save', 'Ctrl+S'],
    ['deselect', 'Deselect', 'square-dashed', 'Ctrl+Shift+A'],
    ['free-transform', 'Transform tool', 'scaling', 'Ctrl+T'],
  ]),
  pack('paint-net', 'Paint.NET', ['paintdotnet.exe'], 'https://www.getpaint.net/doc/latest/KeyboardMouseCommands.html', [
    ['new-layer', 'Add new layer', 'layers', 'Ctrl+Shift+N'],
    ['deselect', 'Deselect', 'square-dashed', 'Ctrl+D'],
    ['invert-selection', 'Invert selection', 'contrast', 'Ctrl+I'],
    ['canvas-size', 'Canvas size', 'scaling', 'Ctrl+Shift+R'],
  ]),
  pack('clip-studio-paint', 'Clip Studio Paint', ['clipstudiopaint.exe'], 'https://help.clip-studio.com/en-us/manual_en/780_shortcuts/Menu_Shortcuts.htm', [
    ['save', 'Save illustration', 'save', 'Ctrl+S'],
    ['deselect', 'Deselect', 'square-dashed', 'Ctrl+D'],
    ['transform', 'Scale or rotate', 'scaling', 'Ctrl+T'],
  ]),
  pack('coreldraw', 'CorelDRAW', ['coreldrw.exe'], 'https://product.corel.com/help/CorelDRAW/540111137/Main/EN/Documentation/CorelDRAW-Keyboard-shortcuts.html', [
    ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D'],
    ['group', 'Group selection', 'group', 'Ctrl+G'],
    ['ungroup', 'Ungroup objects', 'ungroup', 'Ctrl+U'],
    ['convert-curves', 'Convert to curves', 'spline', 'Ctrl+Q'],
  ]),
  pack('capcut', 'CapCut Desktop', ['capcut.exe'], 'https://www.capcut.com/resource/pc-professional-video-editor', [
    ['split', 'Split at playhead', 'scissors', 'Ctrl+B', { context: 'While the timeline has focus' }],
    ['play-pause', 'Play or pause', 'circle-play', 'Space', { context: 'While the timeline has focus' }],
    ['previous-frame', 'Previous frame', 'step-back', 'Left', { context: 'While the timeline has focus' }],
    ['next-frame', 'Next frame', 'step-forward', 'Right', { context: 'While the timeline has focus' }],
  ]),
  pack('autocad', 'AutoCAD', ['acad.exe'], 'https://www.autodesk.com/shortcuts/autocad', [
    ['properties', 'Properties palette', 'list', 'Ctrl+1'],
    ['design-center', 'DesignCenter', 'panels-top-left', 'Ctrl+2'],
    ['command-line', 'Toggle command line', 'square-terminal', 'Ctrl+9'],
    ['ortho', 'Toggle Ortho', 'move-horizontal', 'F8'],
    ['object-snap', 'Toggle object snap', 'magnet', 'F3'],
  ]),
  pack('revit', 'Autodesk Revit', ['revit.exe'], 'https://help.autodesk.com/cloudhelp/2022/ENU/Revit-Customize/files/GUID-529010A2-4AA6-43BE-97C4-169418089575.htm', [
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['open-file', 'Open project', 'folder-open', 'Ctrl+O'],
    ['close-document', 'Close project', 'x', 'Ctrl+W'],
  ]),
  pack('autodesk-fusion', 'Autodesk Fusion', ['fusion360.exe'], 'https://help.autodesk.com/cloudhelp/ENU/Fusion-GetStarted/files/GUID-F0491540-0324-470A-B651-2238D0EFAC30.htm', [
    ['save', 'Save design', 'save', 'Ctrl+S'],
    ['open-file', 'Open design', 'folder-open', 'Ctrl+O'],
    ['data-panel', 'Toggle Data Panel', 'panel-left', 'Ctrl+Alt+P'],
  ]),
  pack('maya', 'Autodesk Maya', ['maya.exe'], 'https://www.autodesk.com/shortcuts/maya', [
    ['save', 'Save scene', 'save', 'Ctrl+S'],
    ['open-file', 'Open scene', 'folder-open', 'Ctrl+O'],
    ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D'],
    ['group', 'Group selection', 'group', 'Ctrl+G'],
  ]),
  pack('3ds-max', 'Autodesk 3ds Max', ['3dsmax.exe'], 'https://help.autodesk.com/view/3DSMAX/2026/ENU/?guid=GUID-47E8B2C2-0D41-44A8-AA0E-9084E7E8B7C3', [
    ['save', 'Save scene', 'save', 'Ctrl+S'],
    ['open-file', 'Open scene', 'folder-open', 'Ctrl+O'],
    ['select-name', 'Select by name', 'list-filter', 'H'],
    ['max-viewport', 'Maximize viewport', 'maximize', 'Alt+W'],
  ], { editing: false }),
  pack('sketchup', 'SketchUp', ['sketchup.exe'], 'https://help.sketchup.com/en/default-keyboard-shortcuts', [
    ['save', 'Save model', 'save', 'Ctrl+S'],
    ['open-file', 'Open model', 'folder-open', 'Ctrl+O'],
    ['zoom-extents', 'Zoom extents', 'maximize', 'Shift+Z'],
  ]),
  pack('freecad', 'FreeCAD', ['freecad.exe'], 'https://wiki.freecad.org/Std_Base', [
    ['save', 'Save model', 'save', 'Ctrl+S'],
    ['refresh', 'Recompute document', 'refresh-cw', 'F5'],
  ]),
  pack('godot', 'Godot Engine', ['godot.exe'], 'https://docs.godotengine.org/en/4.6/tutorials/editor/default_key_mapping.html', [
    ['save', 'Save scene', 'save', 'Ctrl+S'],
    ['play-project', 'Run project', 'play', 'F5'],
    ['play-scene', 'Run current scene', 'play', 'F6'],
    ['stop', 'Stop project', 'square', 'F8'],
  ], { executablePattern: /^godot_v4\.\d+(?:\.\d+)?-stable_(?:mono_)?win(?:32|64|_arm64)\.exe$/ }),
  pack('unity', 'Unity Editor', ['unity.exe'], 'https://docs.unity3d.com/Manual/UnityHotkeys.html', [
    ['save', 'Save scene', 'save', 'Ctrl+S'],
    ['play', 'Toggle Play mode', 'play', 'Ctrl+P'],
    ['pause', 'Pause Play mode', 'pause', 'Ctrl+Shift+P'],
    ['step', 'Step one frame', 'skip-forward', 'Ctrl+Alt+P'],
  ]),
  pack('unreal-editor', 'Unreal Editor', ['unrealeditor.exe', 'ue4editor.exe'], 'https://www.unrealengine.com/en-US/tech-blog/designer-s-guide-to-unreal-engine-keyboard-shortcuts', [
    ['focus-selection', 'Focus selected actor', 'focus', 'F'],
    ['save-all', 'Save all', 'save', 'Ctrl+Shift+S'],
    ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D'],
    ['play', 'Play in editor', 'play', 'Alt+P'],
  ]),
  pack('audacity', 'Audacity', ['audacity.exe'], 'https://manual.audacityteam.org/man/keyboard_shortcut_reference.html', [
    ['play-pause', 'Play or stop', 'circle-play', 'Space'],
    ['pause', 'Pause', 'pause', 'P'],
    ['zoom-selection', 'Zoom to selection', 'zoom-in', 'Ctrl+E'],
    ['fit-project', 'Fit project', 'maximize', 'Ctrl+F'],
  ]),
  pack('ableton-live', 'Ableton Live', [
    'ableton live 12 suite.exe', 'ableton live 12 standard.exe', 'ableton live 12 intro.exe', 'ableton live 12 lite.exe',
    'ableton live 11 suite.exe', 'ableton live 11 standard.exe', 'ableton live 11 intro.exe', 'ableton live 11 lite.exe',
  ], 'https://www.ableton.com/en/live-manual/12/live-keyboard-shortcuts/', [
    ['save', 'Save Live Set', 'save', 'Ctrl+S'],
    ['insert-audio-track', 'Insert audio track', 'audio-lines', 'Ctrl+T'],
    ['insert-midi-track', 'Insert MIDI track', 'music', 'Ctrl+Shift+T'],
    ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D'],
  ]),
  pack('fl-studio', 'FL Studio', ['fl64.exe', 'fl.exe'], 'https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/basics_shortcuts.htm', [
    ['playlist', 'Playlist', 'list-music', 'F5'],
    ['channel-rack', 'Channel Rack', 'list', 'F6'],
    ['piano-roll', 'Piano Roll', 'piano', 'F7'],
    ['mixer', 'Mixer', 'sliders-horizontal', 'F9'],
  ]),
  pack('reaper', 'REAPER', ['reaper.exe'], 'https://www.reaper.fm/userguide.php', [
    ['insert-track', 'Insert new track', 'audio-lines', 'Ctrl+T'],
    ['mixer', 'Toggle mixer', 'sliders-horizontal', 'Ctrl+M'],
    ['render', 'Render project', 'file-output', 'Ctrl+Alt+R'],
    ['play-stop', 'Play or stop', 'circle-play', 'Space'],
  ]),
  pack('cubase', 'Cubase', ['cubase14.exe', 'cubase15.exe', 'cubase16.exe'], 'https://www.steinberg.help/r/cubase-pro/15.0/en/cubase_nuendo/topics/key_commands/key_commands_default_c.html', [
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['play-stop', 'Play or stop', 'circle-play', 'Space'],
    ['mixer', 'Open MixConsole', 'sliders-horizontal', 'F3'],
  ]),
  pack('pro-tools', 'Pro Tools', ['protools.exe'], 'https://www.avid.com/resource-center/pro-tools-shortcuts', [
    ['save', 'Save session', 'save', 'Ctrl+S'],
    ['new-track', 'New track dialog', 'audio-lines', 'Ctrl+Shift+N'],
    ['play-stop', 'Play or stop', 'circle-play', 'Space'],
  ]),
  pack('shotcut', 'Shotcut', ['shotcut.exe'], 'https://www.shotcut.org/howtos/keyboard-shortcuts/', [
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['open-file', 'Open media', 'folder-open', 'Ctrl+O'],
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['export', 'Export panel', 'file-output', 'Ctrl+E'],
  ]),
  pack('kdenlive', 'Kdenlive', ['kdenlive.exe'], 'https://docs.kdenlive.org/en/user_interface/shortcuts.html', [
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['render', 'Render dialog', 'file-output', 'Ctrl+Enter'],
  ]),
  pack('handbrake', 'HandBrake', ['handbrake.exe'], 'https://github.com/HandBrake/HandBrake/blob/master/win/CS/HandBrakeWPF/Views/MainView.xaml', [
    ['open-source', 'Open source', 'folder-open', 'Alt+O'],
    ['queue-selection', 'Add selection to queue', 'list-plus', 'Ctrl+Shift+A'],
    ['show-queue', 'Show queue', 'list-video', 'Ctrl+Q'],
  ], { editing: false }),
  pack('losslesscut', 'LosslessCut', ['losslesscut.exe'], 'https://github.com/mifi/lossless-cut/blob/master/docs.md', [
    ['open-file', 'Open media', 'folder-open', 'Ctrl+O'],
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['previous-frame', 'Previous frame', 'step-back', 'Alt+Left'],
    ['next-frame', 'Next frame', 'step-forward', 'Alt+Right'],
  ], { editing: false }),
  pack('camtasia', 'Camtasia', ['camtasiastudio.exe'], 'https://www.techsmith.com/learn/tutorials/camtasia/shortcuts/', [
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['import', 'Import media', 'file-input', 'Ctrl+I'],
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
  ]),
  pack('snagit', 'Snagit Editor', ['snagiteditor.exe', 'snagiteditor64.exe'], 'https://www.techsmith.com/learn/tutorials/snagit/snagit-hotkeys/', [
    ['save', 'Save capture', 'save', 'Ctrl+S'],
    ['copy-all', 'Copy all', 'copy', 'Ctrl+Shift+C'],
    ['actual-size', 'Actual size', 'scan-eye', 'Ctrl+0'],
  ]),
  pack('irfanview', 'IrfanView', ['i_view64.exe', 'i_view32.exe'], 'https://www.irfanview.com/main_what_is_engl.htm', [
    ['open-file', 'Open image', 'folder-open', 'O'],
    ['batch', 'Batch conversion dialog', 'layers-2', 'B'],
    ['resize', 'Resize or resample', 'scaling', 'Ctrl+R'],
    ['fullscreen', 'Full screen', 'maximize', 'Enter'],
  ], { editing: false }),
  pack('kicad', 'KiCad PCB Editor', ['pcbnew.exe'], 'https://docs.kicad.org/9.0/en/pcbnew/pcbnew.html', [
    ['save', 'Save board', 'save', 'Ctrl+S'],
    ['viewer', 'Open 3D Viewer', 'box', 'Alt+3'],
    ['shortcuts', 'List hotkeys', 'keyboard', 'Ctrl+F1'],
  ]),
  pack('faststone', 'FastStone Image Viewer', ['fsviewer.exe'], 'https://www.faststone.org/FSIVTutorial.htm', [
    ['fullscreen', 'Full screen or browser', 'maximize', 'Enter'],
    ['rotate-left', 'Rotate left', 'rotate-ccw', 'L'],
    ['rotate-right', 'Rotate right', 'rotate-cw', 'R'],
    ['resize', 'Resize image', 'scaling', 'Ctrl+R'],
  ], { editing: false }),
  pack('mpc-hc', 'MPC-HC', ['mpc-hc.exe', 'mpc-hc64.exe'], 'https://github.com/clsid2/mpc-hc/blob/develop/src/mpc-hc/AppSettings.cpp', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['open-file', 'Quick open file', 'folder-open', 'Ctrl+Q'],
    ['mute', 'Toggle mute', 'volume-x', 'Ctrl+M'],
    ['fullscreen', 'Full screen', 'maximize', 'Alt+Enter'],
  ], { editing: false }),
  pack('mpv', 'mpv', ['mpv.exe'], 'https://mpv.io/manual/master/#keyboard-control', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['seek-back', 'Seek backward', 'rewind', 'Left'],
    ['seek-forward', 'Seek forward', 'fast-forward', 'Right'],
    ['subtitles', 'Cycle subtitles', 'captions', 'J'],
    ['fullscreen', 'Full screen', 'maximize', 'F'],
  ], { editing: false }),
  pack('foobar2000', 'foobar2000', ['foobar2000.exe'], 'https://wiki.hydrogenaudio.org/index.php?title=Foobar2000:Preferences:Keyboard_Shortcuts', [
    ['open-file', 'Open files', 'folder-open', 'Ctrl+O'],
    ['add-files', 'Add files', 'file-plus', 'Ctrl+F'],
    ['new-playlist', 'New playlist', 'list-plus', 'Ctrl+N'],
  ], { editing: false }),
  pack('itunes', 'iTunes', ['itunes.exe'], 'https://support.apple.com/guide/itunes/keyboard-shortcuts-itns1019/windows', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['new-playlist', 'New playlist', 'list-plus', 'Ctrl+N'],
    ['get-info', 'Song information', 'info', 'Ctrl+I'],
    usKey('preferences', 'Preferences', 'settings', 'Ctrl+char:,'),
  ], { appIds: ['appleinc.itunes_nzyj5cx40ttqa!itunes'], editing: false }),
];
