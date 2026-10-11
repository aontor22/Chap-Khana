import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminOrders } from '../data/api';
import { supabase } from '../lib/supabase';
import { emptyOrderCursor, reconcileOrderSnapshot } from '../lib/orderNotifications';
import { waitError } from '../lib/utils';
import type { Order } from '../types';

export type RealtimeState = 'demo' | 'connecting' | 'connected' | 'fallback';

// Browser audio must be unlocked by a staff click (autoplay policy).
function playNewOrderSound(ctx: AudioContext | null) {
  if (!ctx || ctx.state !== 'running') return;
  try {
    const begin = ctx.currentTime + .02;
    [0, .19].forEach((offset, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = index ? 880 : 660;
      gain.gain.setValueAtTime(.0001, begin + offset);
      gain.gain.exponentialRampToValueAtTime(.12, begin + offset + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, begin + offset + .16);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(begin + offset); oscillator.stop(begin + offset + .17);
    });
  } catch { /* Audio is optional; order monitoring continues. */ }
}

export function useAdminOrderAlerts({enabled, live, userId}:{enabled:boolean;live:boolean;userId:string|null}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [unread, setUnread] = useState<Order[]>([]);
  const [ready, setReady] = useState(false);
  const [connection, setConnection] = useState<RealtimeState>(live ? 'fallback' : 'demo');
  const [error, setError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const cursorRef = useRef(emptyOrderCursor());
  const scopeRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);
  const fetchSequence = useRef(0);

  const refreshOrders = useCallback(async () => {
    if (!enabled) return;
    const scope = scopeRef.current;
    const request = ++fetchSequence.current;
    try {
      const latest = await getAdminOrders();
      // Discard stale requests after logout, role changes or a newer refresh.
      if (scope !== scopeRef.current || request !== fetchSequence.current) return;
      const result = reconcileOrderSnapshot(cursorRef.current, latest);
      cursorRef.current = result.cursor;
      setOrders(latest);
      setReady(true);
      setError('');
      if (result.newOrders.length) {
        setUnread(prev => {
          const ids = new Set(prev.map(o => o.id));
          return [...result.newOrders.filter(o => !ids.has(o.id)), ...prev].slice(0, 30);
        });
        if (soundRef.current) playNewOrderSound(audioRef.current);
      }
    } catch (err) {
      if (scope === scopeRef.current && request === fetchSequence.current) {
        setError(waitError(err));
        setConnection(live ? 'fallback' : 'demo');
      }
    }
  }, [enabled, live]);

  useEffect(() => {
    ++scopeRef.current;
    cursorRef.current = emptyOrderCursor();
    fetchSequence.current = 0;
    setOrders([]); setUnread([]); setReady(false); setError('');
    setConnection(live ? 'fallback' : 'demo');
    if (!enabled) {
      soundRef.current = false;
      setSoundEnabled(false);
      void audioRef.current?.close(); audioRef.current = null;
      return;
    }
    void refreshOrders();
    // Polling remains active even with Realtime: heals dropped/reconnected events
    // and works before SQL 09 enables the orders publication.
    const timer = window.setInterval(() => { void refreshOrders(); }, 20_000);
    return () => { ++scopeRef.current; window.clearInterval(timer); };
  }, [enabled, live, userId, refreshOrders]);

  useEffect(() => {
    if (!enabled || !live || !supabase || !ready || !userId) return;
    const client = supabase;
    let active = true;
    setConnection('connecting');
    const channel = client.channel(`ck-admin-orders-${userId}`)
      .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'orders'}, () => { void refreshOrders(); })
      .on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'orders'}, () => { void refreshOrders(); })
      .subscribe(status => {
        if (!active) return;
        setConnection(status === 'SUBSCRIBED' ? 'connected' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? 'fallback' : 'connecting');
      });
    return () => { active = false; void client.removeChannel(channel); };
  }, [enabled, live, ready, userId, refreshOrders]);

  const toggleSound = useCallback(async () => {
    if (soundRef.current) {
      soundRef.current = false; setSoundEnabled(false);
      return;
    }
    try {
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      await ctx.resume();
      if (ctx.state !== 'running') throw new Error('Audio is blocked by the browser.');
      soundRef.current = true; setSoundEnabled(true);
      playNewOrderSound(ctx); // Confirm activation during the required staff gesture.
    } catch {soundRef.current = false; setSoundEnabled(false);}
  }, []);

  useEffect(() => () => { void audioRef.current?.close(); audioRef.current = null; }, []);

  const markRead = useCallback(() => setUnread([]), []);
  return {orders, unread, ready, connection, error, soundEnabled, toggleSound, markRead, refreshOrders};
}
