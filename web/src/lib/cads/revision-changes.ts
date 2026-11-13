
import type { CdmEvent } from "./store";

export interface RevisionChange {
  revisionId: number;
  sourceFile: string;
  createdAt: number;

  pc: number | null;
  previousPc: number | null;
  pcChange: "higher" | "lower" | "same" | "n/a";

  missDistanceM: number;
  missDistanceChangeM: number | null;

  tca: number;
  tcaChangeS: number | null;
}

/**
 * Builds a chronological timeline of CDM revisions.
 * Each entry describes changes from the previous revision.
 */
export function getRevisionChanges(
  event: CdmEvent
): RevisionChange[] {
  const revisions = [...event.revisions].sort(
    (a, b) =>
      a.cdm.creationDate - b.cdm.creationDate ||
      a.id - b.id
  );

  return revisions.map((revision, index) => {
    const current = revision.cdm;
    const previous =
      index > 0 ? revisions[index - 1].cdm : null;

    let pcChange: RevisionChange["pcChange"] = "n/a";

    if (
      previous !== null &&
      previous.pc !== null &&
      current.pc !== null
    ) {
      pcChange =
        current.pc > previous.pc
          ? "higher"
          : current.pc < previous.pc
            ? "lower"
            : "same";
    }

    return {
      revisionId: revision.id,
      sourceFile: revision.sourceFile,
      createdAt: current.creationDate,

      pc: current.pc,
      previousPc: previous?.pc ?? null,
      pcChange,

      missDistanceM: current.missDistanceM,
      missDistanceChangeM: previous
        ? current.missDistanceM -
          previous.missDistanceM
        : null,

      tca: current.tca,
      tcaChangeS: previous
        ? (current.tca - previous.tca) / 1000
        : null,
    };
  });
}
