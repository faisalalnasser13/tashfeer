import { useState } from "react";
import { api, errText } from "../lib/firebase";
import { ORDINALS } from "../lib/arabic";
import type { Room, RoundRecord, TeamId } from "../lib/types";
import { OTHER, TEAMS } from "../lib/types";
import { buildLanes, ClueGrid } from "../components/ClueGrid";
import { ScoreStrip } from "../components/ScoreStrip";
import { Banner, Btn, Empty, TEAM_HEX, TEAM_LABEL } from "../components/ui";

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
              {t === myTeam ? "سجلنا" : "سجل العدو"}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-[11.5px] text-muted">
          {side === myTeam
            ? "ما قلتموه عن كل مفتاح"
            : "تخميناتكم لكل رقم · مشتركة بين الفريق"}
        </p>
        <button className="text-[11.5px] text-gold" onClick={() => setChrono((c) => !c)}>
          {chrono ? "حسب الرقم" : "حسب الجولة"}
        </button>
      </div>

      {chrono ? (
        rounds.length === 0 ? (
          <Empty title="السجل فارغ" body="يمتلئ بعد أول كشف." />
        ) : (
          <Chrono rounds={rounds} team={side} />
        )
      ) : (
        <ClueGrid
          lanes={lanes}
          team={side}
          theories={editingTheirs ? theories : undefined}
          onGuess={editingTheirs ? (n, t) => setTheory?.(n, t) : undefined}
        />
      )}
    </div>
  );
}

function Chrono({
  rounds, team,
}: { rounds: RoundRecord[]; team: TeamId }) {
  return (
    <div className="space-y-2">
      {[...rounds].reverse().map((r) => {
        const side = r.data?.[team];
        if (!side) return null;
        return (
          <div key={r.round} className="card p-3">
            <p className="text-[11px] text-muted mb-2">
              الجولة {r.round}
            </p>
            {side.noClues ? (
              <p className="text-[12.5px] text-alarm">لا تلميحات</p>
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

  return (
    <div className="px-4 py-3 pb-10 space-y-4">
      {TEAMS.map((t) => (
        <div key={t} className="card p-4" style={{ borderColor: `${TEAM_HEX[t]}3A` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-display text-[16px]" style={{ color: TEAM_HEX[t] }}>
              {TEAM_LABEL[t]}
              {t === myTeam && <span className="text-[11px] text-muted ms-2">فريقك</span>}
            </span>
            <span className="text-[12px] text-muted">
              اختراق <span className="num">{room.teams[t].score.breach}</span>
              {" · "}
              خلل <span className="num">{room.teams[t].score.fault}</span>
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
                    <span style={{ color: TEAM_HEX[t] }}>مُشفِّر هذه الجولة</span>
                  )}
                  {room.hostUid === m && <span>مضيف</span>}
                  {isHost && m !== uid && room.phase !== "over" && (
                    <button
                      type="button"
                      className="text-[11px] text-alarm/80"
                      onClick={() =>
                        api.kickPlayer({ roomId: room.id, uid: m }).catch((e) => {
                          alert(errText(e));
                        })
                      }
                    >
                      إخراج
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card p-4">
        <p className="text-[12px] text-muted mb-2.5">كيف تُحسب النتيجة</p>
        <ul className="space-y-2 text-[13px] leading-relaxed">
          <li>
            <span style={{ color: "#8FAE5C" }}>اختراق</span> — التقطتم شفرة الخصم. اختراقان يفوزان.
          </li>
          <li>
            <span style={{ color: "#F03B2E" }}>خلل</span> — فريقكم أخطأ في فهم مُشفِّركم. خللان يخسران.
          </li>
          <li className="text-muted">
            أن يفهمكم فريقكم لا يمنحكم شيئًا — يمنعكم فقط من الخسارة.
          </li>
        </ul>
      </div>

      {isHost && room.phase !== "over" && (
        <div className="card p-4 space-y-2">
          <p className="text-[12px] text-muted mb-1">تحكّم المضيف</p>
          <div className="grid grid-cols-3 gap-2">
            <Btn
              variant="ghost"
              className="!py-2.5 !text-[13px]"
              onClick={() => api.hostControl({ roomId: room.id, action: room.paused ? "resume" : "pause" })}
            >
              {room.paused ? "استئناف" : "إيقاف"}
            </Btn>
            <Btn
              variant="ghost"
              className="!py-2.5 !text-[13px]"
              onClick={() => api.hostControl({ roomId: room.id, action: "addTime" })}
            >
              +{30}ث
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
              تخطٍّ / متابعة
            </Btn>
          </div>
          <button
            className="w-full text-[12px] text-alarm/80 pt-2"
            onClick={() =>
              api.hostControl({ roomId: room.id, action: "endGame" }).catch((e) => {
                alert(errText(e));
              })
            }
          >
            إنهاء اللعبة والعودة للردهة
          </button>
        </div>
      )}

      <button
        className="w-full text-[12px] text-muted/70 py-3"
        onClick={() => api.leaveRoom({ roomId: room.id }).finally(onLeave)}
      >
        مغادرة الغرفة
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

  return (
    <div className="card shame-card fade-in">
      <p className="shame-title">
        لائحة النكبات · {TEAM_LABEL[loserTeam]}
      </p>
      <div className="shame-rows">
        {rows.map((r) => {
          const name = room.players[r.uid]?.name ?? "؟";
          return (
            <div key={`${r.uid}-${r.round}`} className="shame-row">
              <span className="shame-round num" title={`الجولة ${r.round}`}>
                {r.round}
              </span>
              <span className="shame-name" style={{ color }} title={name}>
                {name}
              </span>
              <span className="shame-tags">
                {r.breached && <span>اختراق</span>}
                {r.faulted && <span>{r.silent ? "صمت" : "خلل"}</span>}
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

export function GameOver({
  room, uid, myTeam, keys, rounds, onLeave, finalKeys,
}: {
  room: Room; uid: string; myTeam: TeamId | null;
  keys: string[] | null; rounds: RoundRecord[]; onLeave: () => void;
  /** All eight keywords, unsealed only now that the game is over. */
  finalKeys?: Record<TeamId, string[]> | null;
}) {
  const isHost = room.hostUid === uid;
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

  return (
    <div className="px-4 py-5 pb-28" style={{ paddingTop: "calc(var(--safe-t) + 20px)" }}>
      <div className="over-file fade-in">
        <div className="over-file-bar">
          <span className="num">نموذج خت-1</span>
          <span>{draw ? "مغلق · تعادل" : "مغلق"}</span>
        </div>
        <div className="over-head">
          {winnerTeam ? (
            <div
              className="over-winner-stamp"
              aria-label={`فائز: ${TEAM_LABEL[winnerTeam]}`}
            >
              <span className="over-winner-team">{TEAM_LABEL[winnerTeam]}</span>
              <span className="over-winner-mark">فـائـز</span>
            </div>
          ) : (
            <span className="over-closed-mark" aria-hidden>
              {draw ? "تعادل" : "مغلق"}
            </span>
          )}
          {winnerNames.length > 0 && (
            <p
              className="over-winners"
              style={{ color: TEAM_HEX[winnerTeam!] }}
            >
              {winnerNames.join(" · ")}
            </p>
          )}
        </div>
        <div className="over-file-score">
          <ScoreStrip room={room} myTeam={myTeam} showMineLabel={false} />
        </div>
      </div>

      {loserTeam && (
        <EncryptorShame room={room} rounds={rounds} loserTeam={loserTeam} />
      )}
      {draw &&
        TEAMS.map((t) => (
          <EncryptorShame key={t} room={room} rounds={rounds} loserTeam={t} />
        ))}

      <section className="over-records fade-in">
        <div
          className="over-declass-stamp"
          aria-label="رُفعت السرية"
        >
          <span className="over-declass-mark">رُفعت</span>
          <span className="over-declass-sub">السرية</span>
        </div>
        <div className="over-records-head">
          <h2 className="over-records-title">السجل الكامل</h2>
        </div>
        <hr className="over-records-rule" />
        <div className="space-y-3">
          {TEAMS.map((t) => (
            <div key={t} className="card p-3.5" style={{ borderColor: `${TEAM_HEX[t]}44` }}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-display text-[15px]" style={{ color: TEAM_HEX[t] }}>
                  {TEAM_LABEL[t]}
                </span>
                <span className="text-[11.5px] text-muted">
                  اختراق <span className="num">{room.teams[t].score.breach}</span>
                  {" · "}خلل <span className="num">{room.teams[t].score.fault}</span>
                </span>
              </div>
              <ClueGrid
                lanes={buildLanes(rounds, t, finalKeys?.[t] ?? (t === myTeam ? keys : null))}
                team={t}
                declassified
              />
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
                setRematchErr(errText(e));
              });
            }}
          >
            لعبة جديدة
          </Btn>
        ) : (
          <p className="text-center text-[13px] text-muted py-3">
            بانتظار المضيف…
          </p>
        )}
        <button
          className="w-full text-[12px] text-muted/70 pt-3"
          onClick={() => api.leaveRoom({ roomId: room.id }).finally(onLeave)}
        >
          مغادرة الغرفة
        </button>
      </div>
    </div>
  );
}

