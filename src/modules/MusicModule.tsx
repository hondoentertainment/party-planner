import { useState } from "react";
import { Trash2, Music, ExternalLink, ListMusic, Speaker, Mic } from "lucide-react";
import type { EventItem, EventRow } from "../lib/database.types";
import { useEventItems, useEventMembers } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { AssigneePicker } from "./ChecklistModule";
import { SortableList, SortableRow } from "../components/Sortable";

interface MusicMeta {
  artist?: string;
  url?: string;
  set?: string; // 'arrival' | 'main' | 'late'
  duration_min?: number;
  is_playlist?: boolean;
}

const SETS = [
  { key: "arrival", label: "Arrival" },
  { key: "main", label: "Main set" },
  { key: "late", label: "Late night" },
];

export function MusicModule({ event }: { event: EventRow }) {
  const { items } = useEventItems(event.id, "music");
  const members = useEventMembers(event.id, event.owner_id);
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [set, setSet] = useState("main");

  const playlists = items.filter((i) => (i.meta as MusicMeta).is_playlist);
  const tracks = items.filter((i) => !(i.meta as MusicMeta).is_playlist);

  const totalMin = tracks.reduce(
    (a, i) => a + (((i.meta as MusicMeta).duration_min as number) || 3.5),
    0
  );

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !user) return;
    await supabase.from("event_items").insert({
      event_id: event.id,
      kind: "music",
      title: title.trim(),
      created_by: user.id,
      meta: {
        artist: artist || undefined,
        url: url || undefined,
        set,
        is_playlist: false,
      } as MusicMeta,
    });
    setTitle("");
    setArtist("");
    setUrl("");
  };

  const addPlaylist = async () => {
    if (!user) return;
    const name = prompt("Playlist name (e.g. 'Disco vibes')")?.trim();
    if (!name) return;
    const link = prompt("Spotify / Apple Music / YouTube link (optional)")?.trim();
    await supabase.from("event_items").insert({
      event_id: event.id,
      kind: "music",
      title: name,
      created_by: user.id,
      meta: { url: link || undefined, is_playlist: true } as MusicMeta,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-2xl font-bold">Music</h2>
          <p className="text-slate-500 text-sm">
            Playlists, requested tracks, and equipment notes. Group tracks by set.
          </p>
        </div>
        <div className="text-sm text-slate-600 flex items-center gap-3">
          <span>{tracks.length} tracks · ~{Math.round(totalMin)} min</span>
          <button onClick={addPlaylist} className="btn-secondary text-xs">
            <ListMusic size={14} /> Add playlist
          </button>
        </div>
      </div>

      {playlists.length > 0 && (
        <div>
          <h3 className="font-display font-bold flex items-center gap-2 mb-2">
            <Speaker size={16} /> Playlists
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {playlists.map((p) => (
              <PlaylistCard key={p.id} item={p} />
            ))}
          </div>
        </div>
      )}

      <form onSubmit={add} className="card p-3 grid grid-cols-12 gap-2 items-center">
        <input
          className="col-span-12 sm:col-span-4 input py-1.5"
          placeholder="Track title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="col-span-6 sm:col-span-3 input py-1.5"
          placeholder="Artist"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
        />
        <input
          className="col-span-6 sm:col-span-3 input py-1.5"
          placeholder="Link (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <select
          value={set}
          onChange={(e) => setSet(e.target.value)}
          className="col-span-8 sm:col-span-1 input py-1.5"
        >
          {SETS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="col-span-4 sm:col-span-1 btn-primary py-1.5">Add</button>
      </form>

      {SETS.map((s) => {
        const list = tracks.filter((i) => (i.meta as MusicMeta).set === s.key);
        if (list.length === 0) return null;
        return (
          <div key={s.key}>
            <div className="flex items-center gap-2 mb-2 mt-4">
              <Mic size={16} className="text-brand-600" />
              <h3 className="font-display font-bold">{s.label}</h3>
              <span className="text-xs text-slate-500">{list.length}</span>
            </div>
            <div className="space-y-1.5">
              <SortableList items={list}>
                {(item) => (
                  <SortableRow
                    key={item.id}
                    id={item.id}
                    className="flex items-stretch gap-1"
                  >
                    <div className="flex-1 min-w-0">
                      <TrackRow item={item} members={members} />
                    </div>
                  </SortableRow>
                )}
              </SortableList>
            </div>
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="card p-8 text-center text-slate-500 text-sm">
          <Music className="mx-auto mb-2 text-slate-300" />
          No music yet. Add a playlist or queue up requested tracks.
        </div>
      )}
    </div>
  );
}

function PlaylistCard({ item }: { item: EventItem }) {
  const meta = (item.meta as MusicMeta) ?? {};
  const remove = async () => {
    if (!confirm("Remove playlist?")) return;
    await supabase.from("event_items").delete().eq("id", item.id);
  };
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-pink-500 text-white grid place-items-center">
        <ListMusic size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{item.title}</div>
        {meta.url && (
          <a
            href={meta.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-brand-600 inline-flex items-center gap-1 hover:underline truncate"
          >
            Open <ExternalLink size={10} />
          </a>
        )}
      </div>
      <button onClick={remove} className="btn-ghost text-rose-500 py-1 px-2">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function TrackRow({
  item,
  members,
}: {
  item: EventItem;
  members: ReturnType<typeof useEventMembers>;
}) {
  const meta = (item.meta as MusicMeta) ?? {};
  const update = async (patch: Partial<EventItem>) => {
    await supabase.from("event_items").update(patch).eq("id", item.id);
  };
  const updateMeta = async (m: Partial<MusicMeta>) => {
    await update({ meta: { ...meta, ...m } });
  };
  const remove = async () => {
    await supabase.from("event_items").delete().eq("id", item.id);
  };
  const assignee = members.find((m) => m.id === item.assignee_id);

  return (
    <div className="card p-2 flex items-center gap-2 flex-wrap">
      <Music size={14} className="text-slate-400 ml-1" />
      <input
        className="flex-1 min-w-[140px] bg-transparent border-0 focus:outline-none text-sm font-medium"
        value={item.title}
        onChange={(e) => update({ title: e.target.value })}
      />
      <input
        className="w-32 bg-slate-100 border-0 rounded px-2 py-1 text-xs"
        placeholder="Artist"
        value={meta.artist ?? ""}
        onChange={(e) => updateMeta({ artist: e.target.value })}
      />
      <select
        value={meta.set ?? "main"}
        onChange={(e) => updateMeta({ set: e.target.value })}
        className="bg-slate-100 border-0 rounded px-2 py-1 text-xs"
      >
        {SETS.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      {meta.url && (
        <a
          href={meta.url}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost py-1 px-2 text-xs text-brand-600"
        >
          <ExternalLink size={12} />
        </a>
      )}
      <AssigneePicker
        members={members}
        current={assignee}
        onChange={(id) => update({ assignee_id: id })}
      />
      <button onClick={remove} aria-label="Delete track" className="btn-ghost text-rose-500 py-1 px-2">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
