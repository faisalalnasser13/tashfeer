import { useState } from "react";
import { api, errText } from "../lib/firebase";
import { normalizeText, ordinalsFor } from "../lib/arabic";
import { points } from "../lib/rules";
import type { Room, RoundRecord, TeamId } from "../lib/types";
import { OTHER, TEAMS } from "../lib/types";
import { buildLanes, ClueGrid } from "../components/ClueGrid";
import { ScoreStrip } from "../components/ScoreStrip";
import { Banner, Btn, Empty, TEAM_HEX } from "../components/ui";
import { S } from "../lib/strings";

/* ================================================================== */
/* log                                                                */
/* ================================================================== */

export function LogTab({
  room, myTeam, keys, rounds, theories, setTheory,
}: {
  room: Room;
  myTeam: TeamId;
  keys: string[] | null;
  rounds: RoundRecord[];
  theories: Record<string, string>;
  setTheory: ((n: string, text: string) => void) | null;
}) {
  const theirTeam = OTHER[myTeam];
  const [side, setSide] = useState<TeamId>(theirTeam);
  const [chrono, setChrono] = useState(false);
  const s = S(room.lang);

  const lanes = buildLanes(rounds, side, side === myTeam ? keys : null);
  const editingTheirs = side === theirTeam;

  return (
    <div className="px-4 py-3 pb-8">
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[theirTeam, myTeam].map((t) => {
          const on = side === t;
          const color = TEAM_HEX[t];
          return (
            <button
              key={t}
              onClick={() => setSide(t)}
              className="py-2.5 px-2 text-[14px] font-medium transition border"
              style={{
                borderRadius: 0,
                borderColor: on ? `${color}88` : "#3A3629",
                background: on ? `${color}1F` : "#1B1A14",
                color: on ? color : "#8794B8",
              }}
            >
              {t === myTeam ? s.ourLog : s.enemyLogTab}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-[11.5px] text-muted">
          {side === myTeam
            ? s.whatYouSaid
            : s.sharedGuesses}
        </p>
        <button className="text-[11.5px] text-gold" onClick={() => setChrono((c) => !c)}>
          {chrono ? s.byNumber : s.byRound}
        </button>
      </div>

      {chrono ? (
        rounds.length === 0 ? (
          <Empty title={s.emptyLog} body={s.fillsAfter} />
        ) : (
          <Chrono rounds={rounds} team={side} lang={room.lang} />
        )
      ) : (
        <ClueGrid
          lanes={lanes}
          team={side}
          theories={editingTheirs ? theories : undefined}
          onGuess={editingTheirs ? (n, t) => setTheory?.(n, t) : undefined}
          lang={room.lang}
        />
      )}
    </div>
  );
}

function Chrono({
  rounds, team, lang = "ar",
}: { rounds: RoundRecord[]; team: TeamId; lang?: import("../lib/types").Lang }) {
  const s = S(lang);
  const ORDINALS = ordinalsFor(lang);
  return (
    <div className="space-y-2">
      {[...rounds].reverse().map((r) => {
        const side = r.data?.[team];
        if (!side) return null;
        return (
          <div key={r.round} className="card p-3">
            <p className="text-[11px] text-muted mb-2">
              {s.roundNShort(r.round)}
            </p>
            {side.noClues ? (
              <p className="text-[12.5px] text-alarm">{s.noClues}</p>
            ) : (
              <div className="space-y-1.5">
                {side.clues.map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <span
                      className="num text-[14px] font-semibold w-6 h-6 grid place-items-center rounded-md"
                      style={{
                        color: TEAM_HEX[team],
                        background: `${TEAM_HEX[team]}18`,
                        border: `1px solid ${TEAM_HEX[team]}40`,
                      }}
                    >
                      {side.code[i]}
                    </span>
                    <span className="text-[21px] font-medium">{c}</span>
                    <span className="text-[10px] text-muted">{ORDINALS[i]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* team                                                               */
/* ================================================================== */

export function TeamTab({
  room, uid, myTeam, onLeave,
}: { room: Room; uid: string; myTeam: TeamId; onLeave: () => void }) {
  const isHost = room.hostUid === uid;
  const s = S(room.lang);

  return (
    <div className="px-4 py-3 pb-10 space-y-4">
      {TEAMS.map((t) => (
        <div key={t} className="card p-4" style={{ borderColor: `${TEAM_HEX[t]}3A` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-display text-[16px]" style={{ color: TEAM_HEX[t] }}>
              {s.team[t]}
              {t === myTeam && <span className="text-[11px] text-muted ms-2">{s.yourTeamLabel}</span>}
            </span>
            <span className="text-[12px] text-muted">
              {s.breach} <span className="num">{room.teams[t].score.breach}</span>
              {" · "}
              {s.fault} <span className="num">{room.teams[t].score.fault}</span>
            </span>
          </div>
          <div className="space-y-2">
            {room.teams[t].members.map((m) => (
              <div key={m} className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px]">
                  {room.players[m]?.name ?? "—"}
                </span>
                <span className="flex items-center gap-2 text-[10.5px] text-muted shrink-0">
                  {room.encryptor[t] === m && (
                    <span style={{ color: TEAM_HEX[t] }}>{s.encryptorThisRound}</span>
                  )}
                  {room.hostUid === m && <span>{s.host}</span>}
                  {isHost && m !== uid && room.phase !== "over" && (
                    <button
                      type="button"
                      className="text-[11px] text-alarm/80"
                      onClick={() =>
                        api.kickPlayer({ roomId: room.id, uid: m }).catch((e) => {
                          alert(errText(e, room.lang));
                        })
                      }
                    >
                      {s.kick}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card p-4">
        <p className="text-[12px] text-muted mb-2.5">{s.howScore}</p>
        <ul className="space-y-2 text-[13px] leading-relaxed">
          <li style={{ color: "#8FAE5C" }}>{s.breachExplain}</li>
          <li style={{ color: "#F03B2E" }}>{s.faultExplain}</li>
          <li className="text-muted">{s.decryptNothing}</li>
        </ul>
      </div>

      {isHost && room.phase !== "over" && (
        <div className="card p-4 space-y-2">
          <p className="text-[12px] text-muted mb-1">{s.hostControl}</p>
          <div className="grid grid-cols-3 gap-2">
            <Btn
              variant="ghost"
              className="!py-2.5 !text-[13px]"
              onClick={() => api.hostControl({ roomId: room.id, action: room.paused ? "resume" : "pause" })}
            >
              {room.paused ? s.resume : s.pause}
            </Btn>
            <Btn
              variant="ghost"
              className="!py-2.5 !text-[13px]"
              onClick={() => api.hostControl({ roomId: room.id, action: "addTime" })}
            >
              +{30}{s.sec}
            </Btn>
            <Btn
              variant="ghost"
              className="!py-2.5 !text-[13px]"
              onClick={() =>
                api.advancePhase({
                  roomId: room.id, force: true, fromPhase: room.phase, fromRound: room.round,
                }).catch(() => {})
              }
            >
              {s.skipContinue}
            </Btn>
          </div>
          <button
            className="w-full text-[12px] text-alarm/80 pt-2"
            onClick={() =>
              api.hostControl({ roomId: room.id, action: "endGame" }).catch((e) => {
                alert(errText(e, room.lang));
              })
            }
          >
            {s.endGameLobby}
          </button>
        </div>
      )}

      <button
        className="w-full text-[12px] text-muted/70 py-3"
        onClick={() => {
          if (!window.confirm(s.leaveConfirm)) return;
          void api.leaveRoom({ roomId: room.id }).finally(onLeave);
        }}
      >
        {s.leave}
      </button>
    </div>
  );
}

/* ================================================================== */
/* game over                                                          */
/* ================================================================== */

/** One bad encryptor turn — breach and/or fault — with that round's clues inline. */
type ShameRow = {
  uid: string;
  round: number;
  breached: boolean;
  faulted: boolean;
  silent: boolean;
  clues: string[];
  /** Indices into `clues` that caused the breach/fault (red border). */
  blownIndices: number[];
};

/**
 * Which of this turn's three clues to accuse.
 * Fault → slots where decrypt ≠ code.
 * Breach → slots whose digit already had prior clues (the crib that gave you away).
 * If both fire, union. If breach but no prior reuse, leave empty (ambiguous).
 */
function blownClueIndices(
  side: {
    code: number[];
    clues: string[];
    decrypt: (number | null)[];
    noClues: boolean;
    faulted: boolean;
    wasBreached: boolean;
  },
  prior: RoundRecord[],
  team: TeamId,
): number[] {
  if (side.noClues || side.clues.length === 0) return [];
  const hit = new Set<number>();

  if (side.faulted) {
    side.code.forEach((digit, i) => {
      if (side.decrypt[i] !== digit) hit.add(i);
    });
  }

  if (side.wasBreached) {
    const usedBefore = new Set<number>();
    for (const r of prior) {
      const s = r.data?.[team];
      if (!s || s.noClues) continue;
      for (const d of s.code) usedBefore.add(d);
    }
    side.code.forEach((digit, i) => {
      if (usedBefore.has(digit)) hit.add(i);
    });
  }

  return [...hit].sort((a, b) => a - b);
}

function buildShameRows(rounds: RoundRecord[], loserTeam: TeamId): ShameRow[] {
  const rows: ShameRow[] = [];
  for (const r of rounds) {
    const side = r.data?.[loserTeam];
    if (!side?.encryptorUid) continue;
    if (!side.wasBreached && !side.faulted) continue;
    const prior = rounds.filter((x) => x.round < r.round);
    rows.push({
      uid: side.encryptorUid,
      round: r.round,
      breached: side.wasBreached,
      faulted: side.faulted,
      silent: side.noClues,
      clues: side.noClues ? [] : side.clues,
      blownIndices: blownClueIndices(side, prior, loserTeam),
    });
  }
  rows.sort((a, b) => a.round - b.round);
  return rows;
}

/** Encryptors on the losing side who got intercepted or faulted while writing. */
function EncryptorShame({
  room, rounds, loserTeam,
}: {
  room: Room;
  rounds: RoundRecord[];
  loserTeam: TeamId;
}) {
  const rows = buildShameRows(rounds, loserTeam);
  if (rows.length === 0) return null;

  const color = TEAM_HEX[loserTeam];
  const s = S(room.lang);

  return (
    <div className="over-panel shame-panel">
      <p className="shame-title">
        {s.shameList(s.team[loserTeam])}
      </p>
      <div className="shame-rows">
        {rows.map((r) => {
          const name = room.players[r.uid]?.name ?? s.qmark;
          return (
            <div key={`${r.uid}-${r.round}`} className="shame-row">
              <span className="shame-round num" title={s.roundTitle(r.round)}>
                {r.round}
              </span>
              <span className="shame-name" style={{ color }} title={name}>
                {name}
              </span>
              <span className="shame-tags">
                {r.breached && <span>{s.breach}</span>}
                {r.faulted && <span>{r.silent ? s.silent : s.fault}</span>}
              </span>
              <span className="shame-clues">
                {r.silent || r.clues.length === 0 ? (
                  <span className="text-[9px] text-muted">—</span>
                ) : (
                  r.clues.map((c, i) => (
                    <span
                      key={i}
                      className={`shame-clue${r.blownIndices.includes(i) ? " shame-clue-blown" : ""}`}
                      style={
                        r.blownIndices.includes(i)
                          ? undefined
                          : {
                              borderColor: `${color}55`,
                              background: `${color}14`,
                            }
                      }
                      title={c}
                    >
                      {c}
                    </span>
                  ))
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatSubmitMs(ms: number, sec: string): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}${sec}`;
}

/** Compact guess→actual grid for both teams after a showdown finish. */
function ShowdownReveal({
  room, finalKeys,
}: {
  room: Room;
  finalKeys: Record<TeamId, string[]>;
}) {
  const guesses = room.showdownGuesses!;
  const hits = room.showdownHits ?? { gold: 0, silver: 0 };
  const s = S(room.lang);
  return (
    <section className="over-panel fade-in mt-3 px-3 py-2.5 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[14px] text-parch">{s.showdownReveal}</h2>
        <span className="text-[11px] text-muted num">
          {hits.gold} — {hits.silver}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TEAMS.map((t) => {
          const opp = OTHER[t];
          const g = guesses[t] ?? ["", "", "", ""];
          const actual = finalKeys[opp] ?? ["", "", "", ""];
          return (
            <div key={t} className="min-w-0">
              <div
                className="text-[11px] font-medium mb-1 truncate"
                style={{ color: TEAM_HEX[t] }}
              >
                {s.team[t]}
                <span className="num text-muted ms-1">{hits[t] ?? 0}/4</span>
              </div>
              <ul className="space-y-0.5">
                {[0, 1, 2, 3].map((i) => {
                  const guess = (g[i] || "").trim() || "—";
                  const key = actual[i] || "—";
                  const a = normalizeText(g[i] || "", room.lang);
                  const b = normalizeText(actual[i] || "", room.lang);
                  const mark = Boolean(a && b && a === b);
                  return (
                    <li
                      key={i}
                      className="flex items-baseline gap-1 text-[11px] leading-tight"
                    >
                      <span
                        className="num shrink-0"
                        style={{ color: mark ? "#8FAE5C" : "#F03B2E" }}
                      >
                        {mark ? "✓" : "✗"}
                      </span>
                      <span className="truncate text-parch">{guess}</span>
                      <span className="text-muted shrink-0">←</span>
                      <span className="truncate text-muted">{key}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted pt-1 border-t border-line">
        <span>
          {s.tally}{" "}
          <span className="num" style={{ color: TEAM_HEX.gold }}>{hits.gold}</span>
          {" · "}
          <span className="num" style={{ color: TEAM_HEX.silver }}>{hits.silver}</span>
        </span>
        {room.showdownTimeBreak && (
          <span className="num">
            {s.time} {formatSubmitMs(room.submitMs?.gold ?? 0, s.sec)}
            {" / "}
            {formatSubmitMs(room.submitMs?.silver ?? 0, s.sec)}
          </span>
        )}
      </div>
    </section>
  );
}

export function GameOver({
  room, uid, myTeam, keys, rounds, onLeave, finalKeys,
}: {
  room: Room; uid: string; myTeam: TeamId | null;
  keys: string[] | null; rounds: RoundRecord[]; onLeave: () => void;
  /** All eight keywords, unsealed only now that the game is over. */
  finalKeys?: Record<TeamId, string[]> | null;
}) {
  const isHost = room.hostUid === uid;
  const settling = room.endReason === "showdown" && !room.showdownHits;
  const draw = room.winner === "draw";
  const winnerTeam = !draw && (room.winner === "gold" || room.winner === "silver")
    ? (room.winner as TeamId)
    : null;
  const loserTeam = winnerTeam ? OTHER[winnerTeam] : null;
  const winnerNames = winnerTeam
    ? Object.entries(room.players)
        .filter(([, p]) => p.team === winnerTeam)
        .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
        .map(([, p]) => p.name)
    : [];
  const [rematchErr, setRematchErr] = useState<string | null>(null);
  const s = S(room.lang);
  const gp = points(room.teams.gold.score);
  const sp = points(room.teams.silver.score);
  const pointDiff = Math.abs(gp - sp);

  return (
    <div className="px-4 py-5 pb-28" style={{ paddingTop: "calc(var(--safe-t) + 20px)" }}>
      {/*
        Three separate panels. DOM order in over-head: names then stamp —
        under dir=rtl names sit visual right, stamp visual left.
      */}
      <div className="over-panel fade-in">
        <div className="over-file-bar">
          <span className="num">{s.formEnd1}</span>
          <span>{settling ? s.revealing : draw ? s.closedDraw : s.closed}</span>
        </div>

        <div className={`over-head${winnerTeam ? "" : " over-head-closed"}`}>
          {winnerNames.length > 0 && (
            <ul
              className="over-winners"
              style={{ color: TEAM_HEX[winnerTeam!] }}
            >
              {winnerNames.map((name) => (
                <li key={name} className="over-winner-name">
                  <span className="over-winner-medal" aria-hidden>🥇</span>
                  {name}
                </li>
              ))}
            </ul>
          )}
          {winnerTeam ? (
            <div
              className="over-winner-stamp"
              style={{ ["--stamp-color" as string]: TEAM_HEX[winnerTeam] }}
              aria-label={s.winnerAria(s.team[winnerTeam])}
            >
              <span className="over-winner-team">{s.team[winnerTeam]}</span>
              <span className="over-winner-mark">{s.winnerMark}</span>
            </div>
          ) : (
            <span className="over-closed-mark" aria-hidden>
              {draw ? s.drawMark : s.closed}
            </span>
          )}
        </div>

        <div className="over-file-score">
          <ScoreStrip room={room} myTeam={myTeam} showMineLabel={false} />
        </div>

        {room.endReason === "points" && (
          <p className="px-3 pb-3 text-[12.5px] text-parch/90 leading-snug text-center">
            {s.decidedByPoints}
            {" "}
            <span className="num font-medium">(+{pointDiff})</span>
            {" — "}
            {s.breach} <span className="num">+1</span>
            {" · "}
            {s.fault} <span className="num">−1</span>
            <br />
            <span className="text-muted">
              <span style={{ color: TEAM_HEX.gold }}>{s.team.gold}</span>
              {" "}
              <span className="num">{gp}</span>
              {" · "}
              <span style={{ color: TEAM_HEX.silver }}>{s.team.silver}</span>
              {" "}
              <span className="num">{sp}</span>
            </span>
          </p>
        )}
        {room.endReason === "showdown" && !room.showdownTimeBreak && (
          <p className="px-3 pb-3 text-[12.5px] text-muted leading-snug text-center">
            {s.decidedShowdown}
          </p>
        )}
        {room.endReason === "showdown" && room.showdownTimeBreak && (
          <p className="px-3 pb-3 text-[12.5px] text-muted leading-snug text-center">
            {s.decidedTime}
          </p>
        )}
      </div>

      {room.endReason === "showdown" && room.showdownGuesses && finalKeys && (
        <ShowdownReveal room={room} finalKeys={finalKeys} />
      )}

      {loserTeam && room.endReason !== "showdown" && (
        <EncryptorShame room={room} rounds={rounds} loserTeam={loserTeam} />
      )}
      {draw && room.endReason !== "showdown" &&
        TEAMS.map((t) => (
          <EncryptorShame key={t} room={room} rounds={rounds} loserTeam={t} />
        ))}

      <section className="over-panel over-records fade-in">
        <div
          className="over-declass-stamp"
          aria-label={`${s.declassified} ${s.declassifiedSub}`}
        >
          <span className="over-declass-mark">{s.declassified}</span>
          <span className="over-declass-sub">{s.declassifiedSub}</span>
        </div>
        <div className="over-records-head">
          <h2 className="over-records-title">{s.fullLog}</h2>
        </div>
        <div className="over-records-body">
          {TEAMS.map((t, i) => (
            <div key={t}>
              {i > 0 && <hr className="over-records-sep" />}
              <div className="over-team-block">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-display text-[15px]" style={{ color: TEAM_HEX[t] }}>
                    {s.team[t]}
                  </span>
                  <span className="text-[11.5px] text-muted">
                    {s.breach} <span className="num">{room.teams[t].score.breach}</span>
                    {" · "}{s.fault} <span className="num">{room.teams[t].score.fault}</span>
                  </span>
                </div>
                <ClueGrid
                  lanes={buildLanes(rounds, t, finalKeys?.[t] ?? (t === myTeam ? keys : null))}
                  team={t}
                  declassified
                  lang={room.lang}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div
        className="fixed inset-x-0 bottom-0 bg-ink/95 backdrop-blur-sm border-t border-line px-4 pt-3"
        style={{ paddingBottom: "calc(var(--safe-b) + 10px)" }}
      >
        {rematchErr && (
          <div className="mb-2">
            <Banner tone="warn">{rematchErr}</Banner>
          </div>
        )}
        {isHost ? (
          <Btn
            className="w-full"
            onClick={() => {
              setRematchErr(null);
              api.rematch({ roomId: room.id }).catch((e) => {
                setRematchErr(errText(e, room.lang));
              });
            }}
          >
            {s.newGame}
          </Btn>
        ) : (
          <p className="text-center text-[13px] text-muted py-3">
            {s.waitingHostShort}
          </p>
        )}
        <button
          className="w-full text-[12px] text-muted/70 pt-3"
          onClick={() => {
            if (!window.confirm(s.leaveConfirm)) return;
            void api.leaveRoom({ roomId: room.id }).finally(onLeave);
          }}
        >
          {s.leave}
        </button>
      </div>
    </div>
  );
}

