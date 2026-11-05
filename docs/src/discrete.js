// © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Discrete mechanisms (MEC-03, P10.3): detent wheels, carry pawls and ratchets, simulated exactly as a discrete
// state machine, and the mechanical binary and balanced ternary adders built from them (Guidelines 8.3).
//
// A detent wheel has n positions holding the digits d_0 < d_1 < ... < d_{n-1} (two positions 0, 1 for binary;
// three positions -1, 0, +1 for balanced ternary). One detent step turns it by one position. A step forward
// from the last position wraps to the first and the wheel's carry pawl steps the next wheel forward (a carry of
// +1); a step backward from the first position wraps to the last and steps the next wheel backward (a carry of
// -1). So +1 plus +1 gives -1 with a carry of +1, and -1 plus -1 gives +1 with a carry of -1. A ratchet pawl on
// a wheel lets it turn forward only. The pawl of the last wheel has no wheel to drive: its carry leaves the
// register (overflow), which is the wrap modulo n^w of the representation.
//
// The adder works like a stepped accumulator: the first word is set on the accumulator wheels, and the setting
// levers of the second word then turn each accumulator wheel by its digit, one detent step at a time, while the
// carry pawls ripple. The word codes cross the interface (encoders and setting levers) in the representation's
// encoding; a code that names no detent position cannot be set on a wheel: the levers jam, and the interface
// returns the representation's invalid word.

import { SubcoreError } from './core.js';

export const DISCRETE_VERSION = '0.1.0';

export class DetentWheel {
  constructor(digits, position = 0, { ratchet = false, name = 'wheel' } = {}) {
    if (!Array.isArray(digits) || digits.length < 2) throw new SubcoreError('DETENT', name, 'a detent wheel has at least two positions');
    for (let i = 1; i < digits.length; i++) if (!(digits[i] === digits[i - 1] + 1)) throw new SubcoreError('DETENT', name, 'digits are consecutive integers in increasing order');
    this.digits = digits; this.n = digits.length; this.position = position; this.ratchet = ratchet; this.name = name;
    this.steps = 0;
  }
  get digit() { return this.digits[this.position]; }
  set(digit) {
    const p = this.digits.indexOf(digit);
    if (p < 0) throw new SubcoreError('DETENT', this.name, `digit ${digit} is not a detent position of this wheel`);
    this.position = p;
  }
  // One detent step in direction dir (+1 or -1). Returns the carry: +1, -1 or 0.
  step(dir) {
    if (dir !== 1 && dir !== -1) throw new SubcoreError('DETENT', this.name, `a detent step is +1 or -1, not ${dir}`);
    if (dir === -1 && this.ratchet) throw new SubcoreError('RATCHET', this.name, 'the ratchet pawl blocks a backward step');
    this.steps++;
    let p = this.position + dir, carry = 0;
    if (p === this.n) { p = 0; carry = 1; }
    else if (p === -1) { p = this.n - 1; carry = -1; }
    this.position = p;
    return carry;
  }
}

// A register of w detent wheels joined by carry pawls (wheel i drives wheel i + 1).
export class Register {
  constructor(width, digits, { ratchet = false, name = 'register' } = {}) {
    this.width = width; this.digits = digits; this.name = name;
    this.wheels = Array.from({ length: width }, (_, i) => new DetentWheel(digits, digits.indexOf(0), { ratchet, name: `${name}[${i}]` }));
    this.carries = 0; this.overflows = 0;
  }
  set(digitsLsbFirst) { digitsLsbFirst.forEach((d, i) => this.wheels[i].set(d)); }
  read() { return this.wheels.map((w) => w.digit); }
  // Turn wheel i by one detent step; the carry pawls ripple as far as they must.
  step(i, dir) {
    let c = this.wheels[i].step(dir);
    let j = i + 1;
    while (c !== 0) {
      if (j === this.width) { this.overflows++; break; }
      this.carries++;
      c = this.wheels[j].step(c);
      j++;
    }
  }
  // Turn wheel i by digit d (|d| detent steps in the sign of d).
  turn(i, d) {
    const dir = d > 0 ? 1 : -1;
    for (let k = 0; k < Math.abs(d); k++) this.step(i, dir);
  }
}

// Encodings at the interface: word (BigInt) <-> digits, least significant first.
export const ENCODINGS = {
  // two bits per trit: 00 = 0, 01 = +1, 10 = -1; 11 names no trit
  pair: {
    bits: 2,
    decode(code) { return [0, 1, -1, null][code]; },
    encode(d) { return d === 0 ? 0n : d === 1 ? 1n : 2n; },
  },
  binary: {
    bits: 1,
    decode(code) { return [0, 1][code]; },
    encode(d) { return BigInt(d); },
  },
};

export function wordToDigits(word, width, enc) {
  const out = [];
  const mask = (1n << BigInt(enc.bits)) - 1n;
  for (let i = 0; i < width; i++) {
    const d = enc.decode(Number((word >> BigInt(i * enc.bits)) & mask));
    if (d === null || d === undefined) return null;
    out.push(d);
  }
  return out;
}

export function digitsToWord(digits, enc) {
  let w = 0n;
  digits.forEach((d, i) => { w |= enc.encode(d) << BigInt(i * enc.bits); });
  return w;
}

// The adder mechanism described by a discrete configuration (kind: discrete).
export function buildAdder(cfg) {
  const regs = Object.fromEntries(cfg.registers.map((r) => [r.name, r]));
  const el = (k) => cfg.elements.find((e) => e.kind === k);
  const wheels = el('detent_wheels'), levers = el('setting_levers'), pawls = el('carry_pawls'), ratchet = el('ratchet_pawls');
  const acc = regs[wheels.register];
  const enc = ENCODINGS[cfg.interface.encoding];
  const width = acc.wheels;
  const invalid = (1n << BigInt(width * enc.bits)) - 1n;
  const inMask = invalid;
  return {
    width, encoding: cfg.interface.encoding, digits: acc.digits,
    // Add two words. Returns { word, jam, carries, overflows, steps }.
    add(a, b) {
      const da = wordToDigits(a & inMask, width, enc), db = wordToDigits(b & inMask, width, enc);
      if (!da || !db) return { word: invalid, jam: true, carries: 0, overflows: 0, steps: 0 };
      const reg = new Register(width, acc.digits, { ratchet: !!ratchet, name: acc.name });
      reg.set(da);
      if (pawls.overflow !== 'drop') throw new SubcoreError('NOT_IMPLEMENTED', 'carry_pawls.overflow', `overflow '${pawls.overflow}'`);
      for (let i = 0; i < width; i++) if (db[i] !== 0) reg.turn(i, db[i] * (levers.sense === 'subtract' ? -1 : 1));
      const steps = reg.wheels.reduce((s, w) => s + w.steps, 0);
      return { word: digitsToWord(reg.read(), enc), jam: false, carries: reg.carries, overflows: reg.overflows, steps };
    },
  };
}

// Checks for a discrete configuration; errors carry a code and a path.
export function checkDiscrete(cfg, err) {
  const regs = new Map();
  if (!Array.isArray(cfg.registers) || !cfg.registers.length) err('CONFIG', 'registers', 'a discrete mechanism has registers');
  (cfg.registers || []).forEach((r, k) => {
    const p = `registers[${k}]`;
    if (!r || typeof r.name !== 'string') { err('NAME', `${p}.name`, 'invalid register name'); return; }
    if (regs.has(r.name)) err('NAME', `${p}.name`, `register '${r.name}' is declared twice`);
    regs.set(r.name, r);
    if (!(Number.isInteger(r.wheels) && r.wheels >= 1)) err('VALUE', `${p}.wheels`, 'a positive integer');
    if (!Array.isArray(r.digits) || r.digits.length < 2 || !r.digits.every((d, i) => Number.isInteger(d) && (i === 0 || d === r.digits[i - 1] + 1)) || !r.digits.includes(0)) {
      err('VALUE', `${p}.digits`, 'consecutive integers including 0, one per detent position');
    }
  });
  const used = new Set();
  const need = { detent_wheels: 1, carry_pawls: 1, setting_levers: 1 };
  const seen = {};
  (cfg.elements || []).forEach((e, k) => {
    const p = `elements[${k}]`;
    if (!['detent_wheels', 'carry_pawls', 'setting_levers', 'ratchet_pawls'].includes(e.kind)) { err('KIND', `${p}.kind`, `unknown discrete element kind '${e.kind}'`); return; }
    seen[e.kind] = (seen[e.kind] || 0) + 1;
    if (!regs.has(e.register)) { err('REFERENCE', `${p}.register`, `'${e.register}' is not a declared register`); return; }
    used.add(e.register);
    const r = regs.get(e.register);
    if (e.kind === 'detent_wheels' && e.detent_positions !== r.digits.length) err('VALUE', `${p}.detent_positions`, `register '${r.name}' holds ${r.digits.length} digits per wheel`);
    if (e.kind === 'setting_levers') {
      if (!regs.has(e.drives)) err('REFERENCE', `${p}.drives`, `'${e.drives}' is not a declared register`);
      else {
        used.add(e.drives);
        if (regs.get(e.drives).wheels !== r.wheels) err('CONNECTION', `${p}.drives`, 'the levers and the wheels they drive have the same width');
      }
      if (!['add', 'subtract'].includes(e.sense)) err('VALUE', `${p}.sense`, 'add or subtract');
    }
    if (e.kind === 'carry_pawls' && e.overflow !== 'drop') err('VALUE', `${p}.overflow`, "overflow is 'drop' (wrap modulo the register)");
    if (e.kind === 'ratchet_pawls' && r.digits[0] < 0) err('CONNECTION', `${p}.register`, 'a ratchet stops backward steps, which a register with negative digits needs');
  });
  for (const [k, n] of Object.entries(need)) if ((seen[k] || 0) !== n) err('CONFIG', 'elements', `a discrete adder has exactly ${n} ${k} element`);
  (cfg.registers || []).forEach((r, k) => { if (r && r.name && !used.has(r.name)) err('UNCONNECTED', `registers[${k}]`, `register '${r.name}' is not connected to any element`); });
  const i = cfg.interface || {};
  if (!ENCODINGS[i.encoding]) err('VALUE', 'interface.encoding', `encoding is one of ${Object.keys(ENCODINGS).join(', ')}`);
  else {
    const acc = (cfg.registers || []).find((r) => r.role === 'accumulator');
    if (!acc) err('CONFIG', 'registers', 'one register has role accumulator');
    else if (ENCODINGS[i.encoding].bits * acc.wheels > (i.register_bits || 0)) err('VALUE', 'interface.register_bits', 'the word does not fit the register');
    if (acc && i.encoding === 'pair' && acc.digits.join() !== '-1,0,1') err('CONNECTION', 'interface.encoding', 'the pair encoding carries balanced trits');
    if (acc && i.encoding === 'binary' && acc.digits.join() !== '0,1') err('CONNECTION', 'interface.encoding', 'the binary encoding carries bits');
  }
  const op = cfg.operation || {};
  if (op.op !== 'add') err('VALUE', 'operation.op', "the first discrete operation is 'add'");
  if (!op.reference || !op.reference.symbol || !op.reference.spec_id) err('REFERENCE', 'operation.reference', 'names the reference function (spec_id, symbol)');
}
