# Engineering shortcut packs

Deck loads these packs when their Windows application or editor is in the foreground. **Shortcut Packs** shows the full lists and lets you choose which commands to pin and how to group them.

| App or editor | Shortcuts | Examples and sources |
| --- | ---: | --- |
| SOLIDWORKS | 29 | Rebuild, standard views, temporarily hide a component, toggle the FeatureManager. [SOLIDWORKS Design Help](https://help.solidworks.com/2026/english/SolidWorks/sldworks/c_time_saving_keyboard_shortcuts.htm) |
| Altium Designer | 34 | Place wires, switch PCB views, launch interactive routing, open PCB rules, run a Design Rule Check. [Altium shortcuts](https://www.altium.com/documentation/altium-designer/shortcut-keys) · [Schematic](https://www.altium.com/documentation/altium-designer/shortcut-keys/schematic-editors) · [PCB](https://www.altium.com/documentation/altium-designer/shortcut-keys/pcb-editors) |
| KiCad PCB Editor | 32 | Route tracks and differential pairs, tune length, change copper layers, fill zones, open the 3D Viewer. [KiCad PCB Editor](https://docs.kicad.org/10.0/en/pcbnew/pcbnew.html) |
| KiCad Schematic Editor | 28 | Draw wires and buses, place symbols and net labels, edit component fields, navigate sheets. [KiCad Schematic Editor](https://docs.kicad.org/10.0/en/eeschema/eeschema.html) |
| KiCad Footprint Editor | 12 | Draw outlines, place the footprint anchor, edit properties. [KiCad Footprint Editor](https://docs.kicad.org/10.0/en/pcbnew/pcbnew.html#footprint-editor) |
| KiCad Symbol Editor | 11 | Draw pins and graphics, edit properties, search the library tree. [KiCad Symbol Editor](https://docs.kicad.org/10.0/en/eeschema/eeschema.html#symbol-editor) |
| KiCad GerbView | 9 | Switch layers, toggle outlines and D-codes. [KiCad Gerber Viewer](https://docs.kicad.org/10.0/en/gerbview/gerbview.html) |
| MATLAB | 31 | Edit scripts, navigate bookmarks and code sections, execute and debug. [MATLAB Editor](https://www.mathworks.com/help/matlab/matlab_prog/editor-keyboard-shortcuts.html) |
| Simulink | 20 | Browse block libraries, edit the model hierarchy, update or simulate the model. [Simulink Modeling](https://www.mathworks.com/help/simulink/ug/summary-of-mouse-and-keyboard-actions.html) |
| SOLIDWORKS Visualize | 22 | Switch palettes and cameras, control render preview, create keyframes. [Visualize shortcuts](https://help.solidworks.com/2026/English/Visualize/c_visualize_keyboard_shortcuts.htm) |
| SOLIDWORKS Composer | 15 | Create views, control animations, toggle actor visibility and viewport lighting. [Composer shortcuts](https://help.solidworks.com/2024/English/DSSWXComposerDoc/Cps1UserMap/cps-r-ui-KeyboardShortcuts.htm?id=5f775f416c664e5bbb470a073b1c1ed1) |
| LTspice 26 | 24 | Draw schematics, run and pause simulation, open the SPICE log, add waveform traces. [LTspice 26 default keymap](https://www.analog.com/media/en/news-marketing-collateral/solutions-bulletins-brochures/ltspice-keyboard-shortcuts.pdf) |
| NI Multisim | 17 | Wire a circuit, flip and rotate parts, run or pause simulation. [Multisim shortcuts](https://www.ni.com/en/support/documentation/supplemental/18/multisim-default-keyboard-shortcuts.html) |
| NI LabVIEW | 11 | Quick Drop, switch between the front panel and block diagram, run a VI, remove broken wires. [LabVIEW reference card](https://download.ni.com/support/manuals/321353c.pdf) · [Quick Drop](https://knowledge.ni.com/KnowledgeArticleDetails?id=kA00Z0000019ZL1SAM&l=en-US) |
| EasyEDA Pro | 18 | Save all, fit the canvas, highlight nets, rotate and group objects. Install the Pro editor as an app from `https://pro.easyeda.com/editor`. [EasyEDA Pro shortcuts](https://prodocs.easyeda.com/en/introduction/hotkeys/) |

KiCad's PCB and Schematic Editor packs support standalone processes. For windows hosted by the project manager, Deck matches the English or Italian editor title. The Footprint Editor and Symbol Editor also use their window titles when opened from standalone editors. Simulink matches a model title ending in `- Simulink`. The MATLAB desktop pack also recognizes `MATLABWindow.exe` with a MATLAB release title.

In Altium, open the editor named on the shortcut. PCB sequences such as `P` then `T` use the default English menu accelerators. Deck releases each stroke before sending the next and checks the foreground window between strokes. [Altium menu accelerators](https://www.altium.com/documentation/altium-designer/shortcut-keys)
