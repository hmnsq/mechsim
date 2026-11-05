/* © 1993–2026 Abhishek Choudhary. All rights reserved. AyeAI.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Runs the repsynth reference functions (SPC-03) on hexadecimal pairs from standard input, one pair per line,
 * and prints the result in hexadecimal. Built by tests/p10_3_adders.test.mjs against the C sources of
 * hmnsq/repsynth (read only, compiled into .cache/), so the mechanical adders meet the reference functions
 * themselves on extra seeded cases, besides the published vectors.
 *   refrun <symbol>   symbol: bt_add16 bt_add32 bin_add32 bin_add64 */
#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include "balanced_ternary.h"
#include "binary_integer.h"

int main(int argc, char **argv) {
  uint64_t (*f)(uint64_t, uint64_t) = 0;
  if (argc != 2) return 2;
  if (!strcmp(argv[1], "bt_add16")) f = bt_add16;
  else if (!strcmp(argv[1], "bt_add32")) f = bt_add32;
  else if (!strcmp(argv[1], "bin_add32")) f = bin_add32;
  else if (!strcmp(argv[1], "bin_add64")) f = bin_add64;
  if (!f) { fprintf(stderr, "unknown symbol %s\n", argv[1]); return 2; }
  uint64_t a, b;
  while (scanf("%" SCNx64 " %" SCNx64, &a, &b) == 2) printf("%" PRIx64 "\n", f(a, b));
  return 0;
}
