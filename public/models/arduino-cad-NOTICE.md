# Arduino UNO Rev3e CAD attribution

The planar UNO geometry, component positions, copper artwork and silkscreen in
`lib/workbench/cad/uno-rev3e.ts` are derived from Arduino's official
`UNO-TH_Rev3e.brd` in A000066-cad-files.zip, retrieved 2026-09-09.

Copyright Arduino. Licensed under Creative Commons Attribution-ShareAlike 4.0:
https://creativecommons.org/licenses/by-sa/4.0/

Source: https://docs.arduino.cc/hardware/uno-rev3/
CAD download: https://docs.arduino.cc/static/6bb7a3ca51ebee82a252f60c0b418787/A000066-cad-files.zip

Modifications: Eagle coordinates extracted into millimetre-based JSON/TypeScript;
outline arcs tessellated; planar features extruded into approximate package
heights; materials and lighting added. PCB XY/pad placement follows the board
file. Package heights, internal connector details and material appearance are
illustrative; this is not an official 3D manufacturing model. Arduino marks
remain the property of their owners; no endorsement is implied.

Derived CAD data and adaptations are distributed under CC BY-SA 4.0, separately
from the application's MIT-licensed source code. Regenerate the data with
`scripts/import-uno-cad.py` and the source board file.

The same license and adaptation notes apply to the Mega Rev3e data in
`lib/workbench/cad/mega-rev3e.ts`, extracted from Arduino's
`MEGA2560_Rev3e.brd` (also distributed with a CC BY-SA 4.0 License.txt).
Source: https://docs.arduino.cc/hardware/mega-2560/
CAD: https://docs.arduino.cc/static/00ab83283ad8f7aae17832d0fe1b1d51/A000067-cad-files.zip
