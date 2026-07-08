import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Participant, SessionFilters } from "@wherever/shared";
import { cuisineLabel, neighborhoodLabel, PRICE_OPTIONS, RADIUS_OPTIONS, SORT_OPTIONS } from "@wherever/shared";
import { recallName, rememberName } from "../api.js";
import { useSessionSocket } from "../useSessionSocket.js";
import { SwipeDeck } from "../components/SwipeDeck.js";
import { MatchScreen } from "../components/MatchScreen.js";

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
        className="w-full max-w-sm text-center"
      >
        <h1 className="font-display text-3xl font-bold">And you are?</h1>
        <p className="mt-2 text-muted">The group needs a name to overrule.</p>
        <input
          className="mt-6 w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors"
          placeholder="Your name"
          value={name}
          maxLength={24}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={!name.trim()} className="mt-3 w-full rounded-2xl bg-ember px-6 py-3 text-lg font-semibold text-ink disabled:opacity-50 hover:brightness-110 transition">
          Join the table
        </button>
      </form>
    </main>
  );
}

function DisconnectBanner() {
  return (
    <div className="fixed top-0 inset-x-0 z-40 bg-flare/90 text-ink text-center text-sm font-medium py-2">
      Connection dropped. Not blaming anyone.{" "}
      <button onClick={() => location.reload()} className="underline font-semibold">
        Reload to rejoin
      </button>
    </div>
  );
}

function radiusLabel(meters: number): string {
  return RADIUS_OPTIONS.find((o) => o.meters === meters)?.label ?? `${Math.round(meters / 1000)} km`;
}

/** Read-only recap of the filters the host chose, so joiners know the game. */
function FilterSummary({ filters }: { filters: SessionFilters }) {
  const area = filters.area ? neighborhoodLabel(filters.area) : undefined;
  const chips: string[] = [
    area ? `${area} · ${radiusLabel(filters.radiusMeters)}` : radiusLabel(filters.radiusMeters),
    `up to ${PRICE_OPTIONS.find((o) => o.tier === filters.maxPriceTier)?.label ?? "$$$$"}`,
  ];
  if (filters.minRating && filters.minRating > 0) chips.push(`${filters.minRating.toFixed(1)}+ stars`);
  if (filters.minReviews && filters.minReviews > 0) chips.push(`${filters.minReviews}+ reviews`);
  if (filters.openNow) chips.push("open now");
  if (filters.sort === "distance") {
    const sortLabel = SORT_OPTIONS.find((o) => o.value === "distance")?.label ?? "closest";
    chips.push(sortLabel.toLowerCase());
  }
  chips.push(
    filters.categories.length > 0
      ? filters.categories.map(cuisineLabel).join(", ")
      : "any food",
  );

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {chips.map((c) => (
        <span key={c} className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-muted">
          {c}
        </span>
      ))}
    </div>
  );
}

function ParticipantChip({ p }: { p: Participant }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
      <span className="grid place-items-center h-10 w-10 rounded-full bg-gradient-to-br from-ember to-flare text-ink font-bold">
        {initials(p.displayName)}
      </span>
      <span className="font-medium">{p.displayName}</span>
      {p.isHost && (
        <span className="ml-auto rounded-full bg-acid/15 text-acid text-xs font-semibold px-2 py-0.5">
          host
        </span>
      )}
    </div>
  );
}

export default function Lobby() {
  const { code = "" } = useParams();
  const [name, setName] = useState(recallName());

  if (!name) {
    return (
      <NamePrompt
        onSubmit={(n) => {
          rememberName(n);
          setName(n);
        }}
      />
    );
  }
  return <LobbyRoom code={code} displayName={name} />;
}

function LobbyRoom({ code, displayName }: { code: string; displayName: string }) {
  const { session, deck, alreadyVoted, progress, match, visited, error, status, send } =
    useSessionSocket(code, displayName);
  const [copied, setCopied] = useState(false);

  const me = session?.participants.find((p) => p.displayName === displayName);
  const isHost = me?.isHost ?? false;
  const count = session?.participants.length ?? 0;

  async function copyLink() {
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // An error before any session state means a bad or expired code.
  if (error && !session && !match) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="text-6xl">🫥</div>
          <h1 className="mt-4 font-display text-4xl font-bold">This code leads nowhere.</h1>
          <p className="mt-3 text-muted">{error}</p>
          <Link
            to="/"
            className="mt-8 inline-block rounded-full bg-ember px-8 py-3 text-lg font-semibold text-ink hover:brightness-110 transition"
          >
            Start a fresh one
          </Link>
        </div>
      </main>
    );
  }

  // The match outcome wins over everything else once it arrives.
  if (match) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <MatchScreen
          match={match}
          visited={visited}
          isHost={isHost}
          onAgain={() => send({ type: "again" })}
        />
      </main>
    );
  }

  if (session?.status === "swiping") {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        {status === "closed" && <DisconnectBanner />}
        {deck && deck.length > 0 ? (
          <>
            <SwipeDeck
              key={deck.map((r) => r.id).join(",")}
              restaurants={deck}
              alreadyVoted={alreadyVoted}
              onSwipe={(restaurantId, direction) =>
                send({ type: "swipe", restaurantId, direction })
              }
            />
            {progress && progress.totalParticipants > 0 && (
              <p className="mt-6 text-sm text-muted">
                {progress.finishedCount} of {progress.totalParticipants} done
                {isHost && progress.finishedCount < progress.totalParticipants && (
                  <button
                    onClick={() => send({ type: "decide_now" })}
                    className="ml-3 underline hover:text-cream transition-colors"
                  >
                    just decide now
                  </button>
                )}
              </p>
            )}
          </>
        ) : deck ? (
          <div className="text-center max-w-sm">
            <h1 className="font-display text-3xl font-bold">Nothing survived the filters.</h1>
            <p className="mt-2 text-muted">
              Your standards met this neighborhood and won. Loosen something and try again.
            </p>
          </div>
        ) : (
          <p className="text-muted">Dealing the deck...</p>
        )}
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center px-6 pb-16 w-full max-w-md mx-auto">
      {status === "closed" && <DisconnectBanner />}
      <div className="w-full text-center mt-4">
        <p className="text-sm text-muted">Share this code. Or the link. Whatever is less effort.</p>
        <div className="mt-3 font-display text-5xl font-extrabold tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-ember via-flare to-grape">
          {code}
        </div>
        <button onClick={copyLink} className="mt-4 rounded-full border border-white/15 px-5 py-2 text-sm font-medium hover:bg-white/5 transition">
          {copied ? "Copied. Go paste it." : "Copy invite link"}
        </button>
        {session?.filters && <FilterSummary filters={session.filters} />}
      </div>

      <div className="w-full mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-bold">The committee</h2>
          <span className="text-sm text-muted">{count} {count === 1 ? "opinion" : "opinions"}</span>
        </div>
        <div className="flex flex-col gap-2">
          {session?.participants.length ? (
            session.participants.map((p) => <ParticipantChip key={p.id} p={p} />)
          ) : (
            <p className="text-muted text-sm">
              {status === "connecting" ? "Connecting..." : "Just you, for now."}
            </p>
          )}
        </div>
      </div>

      <div className="w-full mt-10">
        {isHost ? (
          <button
            onClick={() => send({ type: "start_round" })}
            className="w-full rounded-full bg-ember px-8 py-4 text-lg font-semibold text-ink shadow-lg shadow-ember/30 hover:scale-[1.02] transition-transform"
          >
            Start swiping
          </button>
        ) : (
          <p className="text-center text-muted">The host hasn't started yet. Gentle peer pressure is an option.</p>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-flare">{error}</p>}
    </main>
  );
}
