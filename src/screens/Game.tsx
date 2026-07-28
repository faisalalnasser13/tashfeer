import React, { useEffect, useRef, useState } from "react";
import {
  useAutoAdvance, useAway, useAwayTracker, useCode, useCountdown, useDraft,
  useEnsureCode, useFinalKeys, usePhaseDriver, useRounds, useTeamGuesses, useTeamPrivate,
} from "../lib/hooks";
import type { Room, TeamId } from "../lib/types";
import { Header } from "../components/Header";
import { KeysStrip } from "../components/KeysStrip";
import { ScoreStrip } from "../components/ScoreStrip";
import { Banner, Empty } from "../components/ui";
import { EncryptPhase, GuessPhase, KeysPhase, RevealPhase, RoundEndPhase } from "./phases";
import { GameOver, LogTab, TeamTab } from "./tabs";

type Tab = "play" | "log" | "team";

/**
 * Keep the top chrome pinned to the *visual* viewport so the soft
 * keyboard can't shove the timer off-screen on mobile browsers.
 */
function useVisualTop() {
  const [top, setTop] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => setTop(vv.offsetTop);
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);
  return top;
}

export function Game({
  room, uid, onLeave,
}: { room: Room; uid: string; onLeave: () => void }) {
  const myTeam = (room.players[uid]?.team ?? null) as TeamId | null;
  const [tab, setTab] = useState<Tab>("play");
  const chromeRef = useRef<HTMLDivElement>(null);
  const [chromeH, setChromeH] = useState(0);
  const visualTop = useVisualTop();

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

  const locallyDone =
    room.phase === "encrypt"
      ? room.cluesIn.gold === true && room.cluesIn.silver === true
      : room.phase === "guess" && myTeam
      ? (() => {
          // Round 1: both teams decrypt at once. Silent encryptor → nothing to send.
          if (room.round < 2) {
            const mine = room.clues[myTeam];
            if (!mine || mine.length !== 3) return true;
            return Boolean(draft?.submittedDecrypt);
          }
          const active = room.activeTeam ?? "gold";
          if (myTeam === active) return Boolean(draft?.submittedDecrypt);
          return Boolean(draft?.submittedIntercept);
        })()
      : false;
  useAutoAdvance(room, locallyDone);

  useAwayTracker(
    room.id, room.round, uid,
    room.phase === "encrypt" || room.phase === "guess"
  );

  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const measure = () => setChromeH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [myTeam, room.phase, room.paused]);

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
    <div className="h-full flex flex-col overflow-hidden">
      <div
        ref={chromeRef}
        className="fixed inset-x-0 z-50 bg-ink"
        style={{ top: visualTop }}
      >
        <Header room={room} remaining={remaining} pct={pct} myTeam={myTeam} />
        {room.paused && (
          <div className="px-4 py-1.5">
            <Banner tone="warn">أوقف المضيف اللعبة مؤقتًا.</Banner>
          </div>
        )}
      </div>

      <main
        className="flex-1 min-h-0 scroll-y"
        style={{
          paddingTop: chromeH || undefined,
          ["--chrome-h" as string]: `${chromeH || 48}px`,
        }}
      >
        {/* Keys + score scroll with content — sticky chrome is timer-only. */}
        <KeysStrip
          keys={priv?.keys ?? null}
          team={myTeam}
          highlight={
            amEncryptor && room.phase === "encrypt" && code ? code : null
          }
        />
        <ScoreStrip room={room} myTeam={myTeam} />
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
      className="shrink-0 z-30 grid grid-cols-3 bg-ink/95 backdrop-blur-sm border-t border-line"
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
