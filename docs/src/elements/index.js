// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The element catalogue (Guidelines 8.1): one module per element kind.

import * as crank from './crank.js';
import * as setting from './setting.js';
import * as gear_pair from './gear_pair.js';
import * as differential from './differential.js';
import * as lead_screw from './lead_screw.js';
import * as integrator from './integrator.js';
import * as cam from './cam.js';
import * as ratchet from './ratchet.js';
import * as counter_wheel from './counter_wheel.js';
import * as dial from './dial.js';
import * as plotter from './plotter.js';

export const ELEMENTS = Object.freeze({ crank, setting, gear_pair, differential, lead_screw, integrator, cam, ratchet, counter_wheel, dial, plotter });
export const KINDS = Object.keys(ELEMENTS);
