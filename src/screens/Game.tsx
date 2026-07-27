import React, { useState } from "react";
import {
  useAutoAdvance, useAway, useAwayTracker, useCode, useCountdown, useDraft,
  useEnsureCode, useFinalKeys, usePhaseDriver, useRounds, useTeamGuesses, useTeamPrivate,
} from "../lib/hooks";
import type { Room, TeamId } from "../lib/types";
import { Header } from "../components/Header";
import { KeysStrip } from "../components/KeysStrip";
import { Banner, Empty } from "../components/ui";
import { EncryptPhase, GuessPhase, KeysPhase, RevealPhase, RoundEndPhase } from "./phases";
import { GameOver, LogTab, TeamTab } from "./tabs";

type Tab = "play" | "log" | "team";

export function Game({
  room, uid, onLeave,
}: { room: Room; uid: string; onLeave: () => void }) {
  const myTeam = (room.players[uid]?.team ?? null) as TeamId | null;
  const [tab, setTab] = useState<Tab>("play");

  const priv = useTeamPrivate(room.id, myTeam);
  const rounds = useRounds(room.id);
  const away = useAway(room.id, room.round);
  const amEncryptor = myTeam ? room.encryptor[myTeam] === uid : false;
  const code = useCode(room.id, myTeam, room.round, amEncryptor);
  const { draft, actions } = useDraft(
    room.id, myTeam, room.phase === "guess" ? room.round : 0
  );
  const { guesses, setWord } = useTeamGuesses(room.id, myTeam);
  const { remaining, pct } = useCountdown(room);

  usePhaseDriver(room, uid);
  useEnsureCode(room.id, myTeam, room.round, amEncryptor, room.phase);

  // Nothing left to wait for on this client's side. The server checks
  // the other team before it actually moves the phase on.
  const locallyDone =
    room.phase === "encrypt"
      ? room.cluesIn.gold === true && room.cluesIn.silver === true
      : room.phase === "guess"
      ? Boolean(draft?.submitted)
      : false;
  useAutoAdvance(room, locallyDone);

  useAwayTracker(
    room.id, room.round, uid,
    room.phase === "encrypt" || room.phase === "guess"
  );

  if (!myTeam) {
    return (
      <div className="p-6" style={{ paddingTop: "calc(var(--safe-t) + 60px)" }}>
        <Empty
          title="أنت خارج الفريقين"
          body="بدأت اللعبة بدونك. انتظر انتهاءها أو اطلب من المضيف إعادة التوزيع."
        />
      </div>
    );
  }

  if (room.phase === "over") {
    return (
      <GameOverWrap
        room={room} uid={uid} myTeam={myTeam}
        keys={priv?.keys ?? null} rounds={rounds} onLeave={onLeave}
      />
    );
  }

  const ctx = {
    room, uid, myTeam,
    keys: priv?.keys ?? null,
    usedClues: priv?.usedClues ?? [],
    rounds, draft, actions, code, away,
    guesses, setGuessWord: setWord,
  };

  return (
    <div className="min-h-full flex flex-col">
      <Header room={room} remaining={remaining} pct={pct} myTeam={myTeam} />
      <KeysStrip
        keys={priv?.keys ?? null}
        team={myTeam}
      />

      {room.paused && (
        <div className="px-4 pt-3">
          <Banner tone="warn">أوقف المضيف اللعبة مؤقتًا.</Banner>
        </div>
      )}

      <main className="flex-1 scroll-y">
        {tab === "play" && <PhaseView ctx={ctx} />}
        {tab === "log" && (
          <LogTab room={room} myTeam={myTeam} keys={priv?.keys ?? null} rounds={rounds} />
        )}
        {tab === "team" && (
          <TeamTab room={room} uid={uid} myTeam={myTeam} onLeave={onLeave} />
        )}
      </main>

      <TabBar tab={tab} setTab={setTab} logCount={rounds.length} />
    </div>
  );
}

function PhaseView({ ctx }: { ctx: Parameters<typeof EncryptPhase>[0] }) {
  switch (ctx.room.phase) {
    case "keys": return <KeysPhase {...ctx} />;
    case "encrypt": return <EncryptPhase {...ctx} />;
    case "guess": return <GuessPhase {...ctx} />;
    case "reveal": return <RevealPhase {...ctx} />;
    case "roundEnd": return <RoundEndPhase {...ctx} />;
    default: return <Empty title="…" />;
  }
}

function TabBar({
  tab, setTab, logCount,
}: { tab: Tab; setTab: (t: Tab) => void; logCount: number }) {
  const items: { id: Tab; label: string; badge?: number }[] = [
    { id: "play", label: "اللعب" },
    { id: "log", label: "السجل", badge: logCount },
    { id: "team", label: "الفريق" },
  ];
  return (
    <nav
      className="sticky bottom-0 z-30 grid grid-cols-3 bg-ink/95 backdrop-blur-sm border-t border-line"
      style={{ paddingBottom: "var(--safe-b)" }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          aria-current={tab === it.id}
          className="py-3 text-[13px] font-medium transition relative"
          style={{ color: tab === it.id ? "#D9A441" : "#8794B8" }}
        >
          {it.label}
          {it.badge ? (
            <span className="num text-[10px] text-muted ms-1">{it.badge}</span>
          ) : null}
          {tab === it.id && (
            <span className="absolute inset-x-7 top-0 h-0.5 bg-gold rounded-full" />
          )}
        </button>
      ))}
    </nav>
  );
}

/** Waits for the sealed keyword doc before showing the final reveal. */
function GameOverWrap(props: React.ComponentProps<typeof GameOver>) {
  const finalKeys = useFinalKeys(props.room.id, true);
  return <GameOver {...props} finalKeys={finalKeys} />;
}
