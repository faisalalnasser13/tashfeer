import { useEffect, useState, type ReactNode } from "react";
import { ensureAuth } from "./lib/firebase";
import { useLocal, useRoom } from "./lib/hooks";
import { startVersionWatch } from "./lib/version";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Game } from "./screens/Game";
import { Banner, Btn, Empty } from "./components/ui";
import { VersionBadge } from "./components/VersionBadge";

function inviteFromUrl(): string | null {
  const r = new URLSearchParams(location.search).get("r");
  if (!r) return null;
  const clean = r.replace(/\D/g, "");
  return clean.length >= 4 ? clean.slice(0, 4) : null;
}

export default function App() {
  const [uid, setUid] = useState<string | null>(null);
  const [authErr, setAuthErr] = useState("");
  const [roomId, setRoomId] = useLocal<string | null>("tashfeer.room", null);
  const { room, missing } = useRoom(roomId);

  useEffect(() => startVersionWatch(), []);

  // Deep link /?r=1234 — stash the code and drop any different saved room
  // so the join screen actually appears (stale tashfeer.room used to win).
  useEffect(() => {
    const r = inviteFromUrl();
    if (!r) return;
    sessionStorage.setItem("tashfeer.invite", r);
    if (roomId !== r) setRoomId(null);
    // roomId is the mount-time value from localStorage; we only want this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the address bar on /?r=CODE while in a room (and while holding an
  // invite on the home screen) so refresh and manual share both work.
  useEffect(() => {
    if (missing) {
      setRoomId(null);
      return;
    }
    const code = roomId ?? sessionStorage.getItem("tashfeer.invite");
    const next = code ? `?r=${code}` : "";
    if (location.search !== next) {
      history.replaceState(null, "", `${location.pathname}${next}`);
    }
  }, [roomId, missing, setRoomId]);

  useEffect(() => {
    ensureAuth()
      .then((u) => setUid(u.uid))
      .catch(() => setAuthErr("تعذّر الاتصال. تحقّق من الشبكة."));
  }, []);

  const shell = (body: ReactNode) => (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">{body}</div>
      <div
        className="shrink-0 py-1.5"
        style={{ paddingBottom: "max(6px, var(--safe-b))" }}
      >
        <VersionBadge />
      </div>
    </div>
  );

  if (authErr) {
    return shell(
      <div className="p-6 pt-24">
        <Banner tone="warn">{authErr}</Banner>
      </div>
    );
  }
  if (!uid) {
    return shell(
      <div className="grid place-items-center h-full text-muted text-[13px]">…</div>
    );
  }

  if (!roomId || missing) {
    return shell(
      <Home
        onEnter={(id) => {
          setRoomId(id);
          sessionStorage.removeItem("tashfeer.invite");
        }}
      />
    );
  }
  if (!room) {
    return shell(
      <div className="grid place-items-center h-full text-muted text-[13px]">…</div>
    );
  }

  // Joined by link but the game already started, or was removed mid-game.
  if (!room.players[uid]) {
    return shell(
      <div className="p-6" style={{ paddingTop: "calc(var(--safe-t) + 60px)" }}>
        <Empty title="لست في هذه الغرفة" body="ربما أخرجك المضيف." />
        <Btn className="w-full mt-4" onClick={() => setRoomId(null)}>
          العودة
        </Btn>
      </div>
    );
  }

  const leave = () => {
    sessionStorage.removeItem("tashfeer.invite");
    setRoomId(null);
  };

  return shell(
    room.phase === "lobby" ? (
      <Lobby room={room} uid={uid} onLeave={leave} />
    ) : (
      <Game room={room} uid={uid} onLeave={leave} />
    )
  );
}
