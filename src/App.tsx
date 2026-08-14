import { useEffect, useState, type ReactNode } from "react";
import { ensureAuth } from "./lib/firebase";
import { useLocal, useRoom } from "./lib/hooks";
import { startVersionWatch } from "./lib/version";
import { asLang } from "./lib/strings";
import { Home } from "./screens/Home";
import { Lobby } from "./screens/Lobby";
import { Game } from "./screens/Game";
import { Banner } from "./components/ui";
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
  const me = room && uid ? room.players[uid] : null;

  useEffect(() => startVersionWatch(), []);

  // Deep link /?r=1234 — open that room so the join page can follow its language.
  useEffect(() => {
    const r = inviteFromUrl();
    if (!r) return;
    sessionStorage.setItem("tashfeer.invite", r);
    if (roomId !== r) setRoomId(r);
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
    const en = room?.lang === "en";
    document.documentElement.lang = en ? "en" : "ar";
    document.documentElement.dir = en ? "ltr" : "rtl";
    document.title = !room || !me
      ? "تشفير · Cipher"
      : en ? "Cipher" : "تشفير";
  }, [room, me]);

  useEffect(() => {
    ensureAuth()
      .then((u) => setUid(u.uid))
      .catch(() => setAuthErr("تعذّر الاتصال. تحقّق من الشبكة.\nCouldn't connect. Check the network."));
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

  const enter = (id: string) => {
    setRoomId(id);
    sessionStorage.removeItem("tashfeer.invite");
  };

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

  if (!roomId) {
    return shell(<Home onEnter={enter} />);
  }

  if (missing) {
    return shell(<Home onEnter={enter} />);
  }

  if (!room) {
    return shell(
      <div className="grid place-items-center h-full text-muted text-[13px]">…</div>
    );
  }

  if (!me) {
    return shell(
      <Home onEnter={enter} initialCode={room.id} joinLang={asLang(room.lang)} />
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
