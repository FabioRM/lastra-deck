// @ts-check
'use strict';

const { desktopPack: pack } = require('./shortcut-pack-data');

module.exports = [
  pack('clipchamp', 'Microsoft Clipchamp', ['clipchamp.exe'], 'https://support.microsoft.com/en-us/clipchamp/keyboard-shortcuts-for-clipchamp', [
    ['export', 'Open export', 'file-output', 'Alt+E'],
    ['split', 'Split at playhead', 'scissors', 'S', { context: 'While editing the timeline' }],
    ['play-pause', 'Play or pause', 'circle-play', 'Space', { context: 'While editing the timeline' }],
  ], { appIds: ['clipchamp.clipchamp_yxz26nhyzhsrt!app'] }),
  pack('solidworks', 'SOLIDWORKS', ['sldworks.exe'], 'https://help.solidworks.com/2026/english/SolidWorks/sldworks/c_time_saving_keyboard_shortcuts.htm', [
    ['shortcut-bar', 'Open shortcut bar', 'command', 'S'],
    ['rebuild', 'Rebuild model', 'refresh-cw', 'Ctrl+B'],
    ['rebuild-all', 'Force rebuild', 'refresh-cw', 'Ctrl+Q'],
    ['zoom-fit', 'Zoom to fit', 'maximize', 'F'],
  ]),
  pack('rhino', 'Rhinoceros', ['rhino.exe'], 'https://docs.mcneel.com/rhino/8/help/en-us/user_interface/shortcuts.htm', [
    ['history', 'Command history', 'history', 'F2'],
    ['grid', 'Toggle grid', 'grid-2x2', 'F7'],
    ['snap', 'Toggle grid snap', 'magnet', 'F9'],
    ['save', 'Save model', 'save', 'Ctrl+S'],
  ]),
  pack('archicad', 'Archicad', ['archicad.exe'], 'https://help.graphisoft.com/AC/29/INT/_AC29_Help/140_UserInterfaceDialogBoxes/140_UserInterfaceDialogBoxes-43.htm', [
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['open-file', 'Open project', 'folder-open', 'Ctrl+O'],
    ['view-3d', 'Open 3D window', 'box', 'F5'],
  ]),
  pack('houdini', 'Houdini', ['houdini.exe', 'houdinifx.exe'], 'https://media.sidefx.com/uploads/learn-main-menu/start-here/houdini20_shortcuts.pdf', [
    ['translate', 'Translate tool', 'move', 'T', { context: 'In the scene view' }],
    ['rotate', 'Rotate tool', 'rotate-cw', 'R', { context: 'In the scene view' }],
    ['scale', 'Scale tool', 'scaling', 'E', { context: 'In the scene view' }],
  ]),
  pack('inventor', 'Autodesk Inventor', ['inventor.exe'], 'https://www.autodesk.com/shortcuts/inventor', [
    ['save', 'Save document', 'save', 'Ctrl+S'],
    ['home-view', 'Home view', 'house', 'F6'],
    ['slice-graphics', 'Slice graphics', 'scissors', 'F7'],
    ['browser', 'Toggle model browser', 'panel-left', 'Alt+1'],
  ]),
  pack('bricscad', 'BricsCAD', ['bricscad.exe'], 'https://help.bricsys.com/en-us/document/bricscad/getting-started-with-bricscad/exploring-the-interface/keyboard-shortcuts?version=V24', [
    ['save', 'Save drawing', 'save', 'Ctrl+S'],
    ['properties', 'Properties panel', 'sliders-horizontal', 'Ctrl+1'],
    ['ortho', 'Toggle Ortho', 'move-horizontal', 'F8'],
    ['command-line', 'Toggle command line', 'square-terminal', 'Ctrl+9'],
  ]),
  pack('librecad', 'LibreCAD', ['librecad.exe'], 'https://docs.librecad.org/en/latest/ref/tools.html', [
    ['save', 'Save drawing', 'save', 'Ctrl+S'],
    ['open-file', 'Open drawing', 'folder-open', 'Ctrl+O'],
    ['print', 'Print drawing', 'printer', 'Ctrl+P'],
  ]),
  pack('openscad', 'OpenSCAD', ['openscad.exe'], 'https://openscad.org/cheatsheet/', [
    ['save', 'Save script', 'save', 'Ctrl+S'],
    ['preview', 'Preview model', 'eye', 'F5'],
    ['render', 'Render model', 'box', 'F6'],
    ['export-stl', 'Export STL', 'file-output', 'F7'],
  ]),
  pack('sweet-home-3d', 'Sweet Home 3D', ['sweethome3d.exe'], 'https://www.sweethome3d.com/userGuide.jsp', [
    ['save', 'Save home', 'save', 'Ctrl+S'],
    ['open-file', 'Open home', 'folder-open', 'Ctrl+O'],
    ['add-furniture', 'Add selected furniture', 'armchair', 'Ctrl+Shift+F'],
  ]),
  pack('cura', 'UltiMaker Cura', ['ultimaker-cura.exe', 'cura.exe'], 'https://github.com/Ultimaker/Cura/blob/main/resources/qml/Actions.qml', [
    ['open-file', 'Open model', 'folder-open', 'Ctrl+O'],
    ['multiply', 'Multiply selection', 'copy', 'Ctrl+M'],
    ['group', 'Group models', 'group', 'Ctrl+G'],
    ['ungroup', 'Ungroup models', 'ungroup', 'Ctrl+Shift+G'],
  ], { editing: false }),
  pack('prusaslicer', 'PrusaSlicer', ['prusa-slicer.exe', 'prusa-slicer-gui.exe'], 'https://help.prusa3d.com/article/keyboard-shortcuts_1764', [
    ['import', 'Import model', 'file-input', 'Ctrl+I'],
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['arrange', 'Arrange objects', 'layout-grid', 'A'],
    ['slice', 'Slice plate', 'layers', 'Ctrl+R'],
  ], { editing: false }),
  pack('bambu-studio', 'Bambu Studio', ['bambu-studio.exe'], 'https://github.com/bambulab/BambuStudio/blob/master/src/slic3r/GUI/Plater.cpp', [
    ['import', 'Import model', 'file-input', 'Ctrl+I'],
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['arrange', 'Arrange objects', 'layout-grid', 'A'],
  ], { editing: false }),
  pack('orcaslicer', 'OrcaSlicer', ['orca-slicer.exe'], 'https://github.com/OrcaSlicer/OrcaSlicer/wiki/keyboard_shortcuts', [
    ['import', 'Import model', 'file-input', 'Ctrl+I'],
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['arrange', 'Arrange objects', 'layout-grid', 'A'],
  ], { editing: false }),
  pack('meshlab', 'MeshLab', ['meshlab.exe'], 'https://github.com/cnr-isti-vclab/meshlab/blob/main/src/meshlab/mainwindow_Init.cpp', [
    ['open-project', 'Open project', 'folder-open', 'Ctrl+O'],
    ['import', 'Import mesh', 'file-input', 'Ctrl+I'],
    ['save-project', 'Save project', 'save', 'Ctrl+S'],
  ], { editing: false }),
  pack('qgis', 'QGIS', ['qgis-bin.exe', 'qgis-ltr-bin.exe'], 'https://docs.qgis.org/testing/en/docs/user_manual/introduction/qgis_gui.html', [
    ['save', 'Save QGIS project', 'save', 'Ctrl+S'],
    ['locator', 'Focus locator', 'search', 'Ctrl+K'],
    ['add-vector', 'Add vector layer', 'layers', 'Ctrl+Shift+V'],
    ['add-raster', 'Add raster layer', 'image-plus', 'Ctrl+Shift+R'],
  ]),
  pack('arcgis-pro', 'ArcGIS Pro', ['arcgispro.exe'], 'https://pro.arcgis.com/en/pro-app/latest/get-started/arcgis-pro-keyboard-shortcuts.htm', [
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['open-project', 'Open project', 'folder-open', 'Ctrl+O'],
    ['new-project', 'New project', 'file-plus', 'Ctrl+N'],
    ['catalog', 'Catalog pane', 'files', 'Alt+C'],
  ]),
  pack('google-earth-pro', 'Google Earth Pro', ['googleearth.exe'], 'https://support.google.com/earth/answer/148115', [
    ['north', 'Orient north', 'compass', 'N', { context: 'While the globe has focus' }],
    ['top-view', 'Tilt to top view', 'map', 'U', { context: 'While the globe has focus' }],
    ['reset-view', 'Reset tilt and compass', 'rotate-ccw', 'R', { context: 'While the globe has focus' }],
  ], { editing: false }),
  pack('aseprite', 'Aseprite', ['aseprite.exe'], 'https://www.aseprite.org/docs/keyboard-shortcuts/', [
    ['save', 'Save sprite', 'save', 'Ctrl+S'],
    ['export-sprite-sheet', 'Export sprite sheet', 'file-output', 'Ctrl+Shift+E'],
    ['new-frame', 'New frame', 'square-plus', 'Alt+N'],
  ]),
  pack('libresprite', 'LibreSprite', ['libresprite.exe'], 'https://github.com/LibreSprite/LibreSprite/blob/master/data/gui.xml', [
    ['save', 'Save sprite', 'save', 'Ctrl+S'],
    ['open-file', 'Open sprite', 'folder-open', 'Ctrl+O'],
    ['new-frame', 'New frame', 'square-plus', 'Alt+N'],
  ]),
  pack('pencil2d', 'Pencil2D', ['pencil2d.exe'], 'https://github.com/pencil2d/pencil/blob/master/app/ui/mainwindow2.ui', [
    ['save', 'Save animation', 'save', 'Ctrl+S'],
    ['play', 'Play animation', 'play', 'Enter'],
    ['previous-frame', 'Previous frame', 'step-back', 'Left'],
    ['next-frame', 'Next frame', 'step-forward', 'Right'],
  ]),
  pack('opentoonz', 'OpenToonz', ['opentoonz.exe'], 'https://opentoonz.readthedocs.io/en/latest/keyboard_shortcuts.html', [
    ['save-level', 'Save level', 'save', 'Ctrl+S'],
    ['save-all', 'Save all', 'save-all', 'Ctrl+Shift+S'],
    ['play', 'Play scene', 'play', 'P'],
  ]),
  pack('affinity', 'Affinity', ['affinity.exe'], 'https://www.affinity.studio/help/desktop-settings-shortcuts/', [
    ['save', 'Save document', 'save', 'Ctrl+S'],
    ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+J'],
    ['deselect', 'Deselect', 'square-dashed', 'Ctrl+D'],
    ['group', 'Group selection', 'group', 'Ctrl+G'],
  ]),
  pack('adobe-fresco', 'Adobe Fresco', ['fresco.exe'], 'https://helpx.adobe.com/fresco/desktop/introduction/keyboard-shortcuts.html', [
    ['pixel-brush', 'Pixel brush', 'paintbrush', 'P'],
    ['eraser', 'Eraser', 'eraser', 'E'],
    ['transform', 'Transform', 'scaling', 'Ctrl+T'],
  ]),
  pack('darktable', 'darktable', ['darktable.exe'], 'https://docs.darktable.org/usermanual/5.8/en/darkroom/overview/', [
    ['darkroom', 'Develop image', 'sliders-horizontal', 'D', { context: 'While in lighttable' }],
    ['lighttable', 'Open lighttable', 'images', 'L'],
    ['panels', 'Toggle panels', 'panels-top-left', 'Tab'],
  ], { editing: false }),
  pack('rawtherapee', 'RawTherapee', ['rawtherapee.exe'], 'https://rawpedia.rawtherapee.com/Keyboard_Shortcuts/it', [
    ['save', 'Save processed image', 'save', 'Ctrl+S'],
    ['queue', 'Send to batch queue', 'list-plus', 'Ctrl+Q'],
    ['browser', 'File browser', 'files', 'Ctrl+F2'],
  ], { editing: false }),
  pack('capture-one', 'Capture One', ['captureone.exe'], 'https://support.captureone.com/hc/en-us/articles/360003399778-What-are-the-hotkeys-in-Capture-One', [
    ['import', 'Import images', 'file-input', 'Ctrl+Shift+I'],
    ['variant', 'New variant', 'layers-2', 'F7',
      { source: 'https://support.captureone.com/hc/en-us/articles/360002536118-Creating-a-copy-of-the-original-image-New-Variant' }],
    ['clone-variant', 'Clone variant', 'copy', 'F8',
      { source: 'https://support.captureone.com/hc/en-us/articles/360002533237-Creating-a-copy-of-the-selected-image-Clone-Variant' }],
  ], { editing: false }),
  pack('digikam', 'digiKam', ['digikam.exe'], 'https://docs.digikam.org/en/setup_application/shortcuts_settings.html', [
    ['rename', 'Rename items', 'pencil', 'F2'],
    ['edit-image', 'Open Image Editor', 'image', 'F4'],
    ['fullscreen', 'Toggle full screen', 'maximize', 'Ctrl+Shift+F'],
  ], { editing: false }),
  pack('xnview-mp', 'XnView MP', ['xnviewmp.exe'], 'https://www.xnview.com/wiki/index.php/Shortcut_keys', [
    ['open-file', 'Open image', 'folder-open', 'Ctrl+O'],
    ['save-as', 'Save as', 'file-plus', 'Ctrl+Shift+S'],
    ['fullscreen', 'Toggle full screen', 'maximize', 'F11'],
  ], { editing: false }),
  pack('scribus', 'Scribus', ['scribus.exe'], 'https://wiki.scribus.net/canvas/Keyboard_Shortcuts', [
    ['save', 'Save layout', 'save', 'Ctrl+S'],
    ['group', 'Group objects', 'group', 'Ctrl+G'],
    ['properties', 'Properties palette', 'sliders-horizontal', 'F2'],
  ]),
];
