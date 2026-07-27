import { useState } from "react";
import { api } from "../lib/firebase";
import { ORDINALS } from "../lib/arabic";
import type { Room, RoundRecord, TeamId } from "../lib/types";
import { OTHER, TEAMS } from "../lib/types";
import { buildLanes, ClueGrid } from "../components/ClueGrid";
import { Avatar, Banner, Btn, Empty, TEAM_HEX, TEAM_LABEL } from "../components/ui";

/* ================================================================== */
/* log                                                                */
/* ================================================================== */

export function LogTab({
  room, myTeam, keys, rounds,
}: { room: Room; myTeam: TeamId; keys: string[] | null; rounds: RoundRecord[] }) {
  const theirTeam = OTHER[myTeam];
  const [side, setSide] = useState<TeamId>(theirTeam);
  const [chrono, setChrono] = useState(false);

  const lanes = buildLanes(rounds, side, side === myTeam ? keys : null);

  return (
    <div className="px-4 py-3 pb-8">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0C1330] border border-line mb-3">
        {[theirTeam, myTeam].map((t) => (
          <button
            key={t}
            onClick={() => setSide(t)}
            className="rounded-lg py-2.5 text-[14px] font-medium transition"
            style={{
              background: side === t ? `${TEAM_HEX[t]}1F` : "transparent",
              color: side === t ? TEAM_HEX[t] : "#8794B8",
              boxShadow: side === t ? `inset 0 0 0 1px ${TEAM_HEX[t]}55` : undefined,
            }}
          >
            {t === myTeam ? "تلميحاتنا" : `تلميحات ${TEAM_LABEL[t]}`}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-[11.5px] text-muted">
          {side === myTeam
            ? "ما قلتموه عن كل مفتاح"
            : "مصنّفة حسب الرقم الذي تبيّن أنها تعنيه"}
        </p>
        <button className="text-[11.5px] text-gold" onClick={() => setChrono((c) => !c)}>
          {chrono ? "حسب الرقم" : "حسب الجولة"}
        </button>
      </div>

      {rounds.length === 0 ? (
        <Empty title="السجل فارغ" body="يمتلئ بعد أول كشف." />
      ) : chrono ? (
        <Chrono rounds={rounds} team={side} />
      ) : (
        <ClueGrid lanes={lanes} team={side} />
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
                      className="num font-display text-[15px] w-6 h-6 grid place-items-center rounded-md"
                      style={{
                        color: TEAM_HEX[team],
                        background: `${TEAM_HEX[team]}18`,
                        border: `1px solid ${TEAM_HEX[team]}40`,
                      }}
                    >
                      {side.code[i]}
                    </span>
                    <span className="text-[14px]">{c}</span>
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
                <Avatar
                  n={room.players[m]?.avatar ?? 0}
                  name={room.players[m]?.name ?? "—"}
                  team={t}
                  size={26}
                />
                <span className="flex gap-2 text-[10.5px] text-muted shrink-0">
                  {room.encryptor[t] === m && (
                    <span style={{ color: TEAM_HEX[t] }}>مُشفِّر هذه الجولة</span>
                  )}
                  {room.hostUid === m && <span>مضيف</span>}
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
            <span style={{ color: "#6FBF95" }}>اختراق</span> — التقطتم شفرة الخصم. اختراقان يفوزان.
          </li>
          <li>
            <span style={{ color: "#E57A6F" }}>خلل</span> — فريقكم أخطأ في فهم مُشفِّركم. خللان يخسران.
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
              تخطٍّ
            </Btn>
          </div>
          <button
            className="w-full text-[12px] text-alarm/80 pt-2"
            onClick={() => api.hostControl({ roomId: room.id, action: "endGame" })}
          >
            إنهاء اللعبة
          </button>
        </div>
      )}

      <button className="w-full text-[12px] text-muted/70 py-3" onClick={onLeave}>
        مغادرة الغرفة
      </button>
    </div>
  );
}

/* ================================================================== */
/* game over                                                          */
/* ================================================================== */

const REASON: Record<string, string> = {
  breach: "باختراقين",
  opponentFault: "بخللين على الخصم",
  points: "بفارق النقاط",
  exhausted: "نفدت الجولات",
  abandoned: "أُنهيت اللعبة",
};

export function GameOver({
  room, uid, myTeam, keys, rounds, onLeave, finalKeys,
}: {
  room: Room; uid: string; myTeam: TeamId | null;
  keys: string[] | null; rounds: RoundRecord[]; onLeave: () => void;
  /** All eight keywords, unsealed only now that the game is over. */
  finalKeys?: Record<TeamId, string[]> | null;
}) {
  const isHost = room.hostUid === uid;
  const won = room.winner === myTeam;
  const draw = room.winner === "draw";

  return (
    <div className="px-4 py-8 pb-28" style={{ paddingTop: "calc(var(--safe-t) + 32px)" }}>
      <div className="text-center mb-8 fade-in">
        <p className="text-[12px] text-muted mb-2">{REASON[room.endReason ?? ""] ?? ""}</p>
        <h1
          className="font-display text-[40px] leading-tight"
          style={{ color: draw ? "#EFE7D4" : TEAM_HEX[room.winner as TeamId] ?? "#EFE7D4" }}
        >
          {draw ? "تعادل" : `فاز ${TEAM_LABEL[room.winner as TeamId]}`}
        </h1>
        {myTeam && !draw && (
          <p className="text-[14px] text-muted mt-2">{won ? "أحسنتم." : "في المرة القادمة."}</p>
        )}
      </div>

      <p className="text-[12px] text-muted mb-3 px-1">كل المفاتيح، وكل ما قيل عنها</p>
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
            />
          </div>
        ))}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 bg-ink/95 backdrop-blur-sm border-t border-line px-4 pt-3"
        style={{ paddingBottom: "calc(var(--safe-b) + 10px)" }}
      >
        {isHost ? (
          <Btn className="w-full" onClick={() => api.rematch({ roomId: room.id })}>
            جولة جديدة بنفس الفريقين
          </Btn>
        ) : (
          <p className="text-center text-[13px] text-muted py-3">
            بانتظار المضيف…
          </p>
        )}
        <button className="w-full text-[12px] text-muted/70 pt-3" onClick={onLeave}>
          مغادرة الغرفة
        </button>
      </div>
    </div>
  );
}

