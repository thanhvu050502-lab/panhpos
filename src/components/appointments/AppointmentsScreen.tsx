import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useCache } from '../../hooks/useCache';
import { useLang } from '../../contexts/LangContext';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { toast } from '../ui/Toast';
import { formatTime, todayStr } from '../../lib/utils';

const TL_START_H = 6;
const TL_END_H = 23;
const PX_PER_MIN = 1.4;
const TL_HEIGHT = (TL_END_H - TL_START_H) * 60 * PX_PER_MIN;

function getWeekDates(dateStr: string): string[] {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const nd = new Date(d);
    nd.setDate(d.getDate() - day + i);
    dates.push(nd.toISOString().split('T')[0]);
  }
  return dates;
}

function getMonthDates(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function layoutBlocks(appts: any[], containerW: number) {
  const blocks = appts.map(a => {
    const dt = new Date(a.scheduled_at || a.datetime);
    const startM = dt.getHours() * 60 + dt.getMinutes() - TL_START_H * 60;
    const endM = startM + (a.duration_mins || 60);
    return { ...a, startM, endM, col: 0, totalCols: 1 };
  });
  // Sort by start
  blocks.sort((a, b) => a.startM - b.startM);
  // Assign columns
  const cols: number[] = [];
  for (const b of blocks) {
    let placed = false;
    for (let c = 0; c < cols.length; c++) {
      if (cols[c] <= b.startM) {
        b.col = c;
        cols[c] = b.endM;
        placed = true;
        break;
      }
    }
    if (!placed) {
      b.col = cols.length;
      cols.push(b.endM);
    }
    b.totalCols = cols.length;
  }
  // Second pass: set totalCols to max overlapping
  for (const b of blocks) {
    let maxCols = b.totalCols;
    for (const b2 of blocks) {
      if (b2 !== b && b2.startM < b.endM && b2.endM > b.startM) {
        maxCols = Math.max(maxCols, b2.col + 1, b.col + 1);
      }
    }
    b.totalCols = maxCols;
  }
  const w = containerW || 320;
  return blocks.map(b => ({
    ...b,
    top: Math.max(0, b.startM) * PX_PER_MIN,
    height: Math.max(30, (b.endM - b.startM) * PX_PER_MIN),
    left: (b.col / b.totalCols) * (w - 56) + 56,
    width: ((w - 56) / b.totalCols) - 2,
  }));
}

export const AppointmentsScreen: React.FC = () => {
  const { cache, dbUpdate, dbDelete } = useCache();
  const { t } = useLang();
  const today = todayStr();
  const [calView, setCalView] = useState<'month' | 'week' | 'day'>('day');
  const [selectedDate, setSelectedDate] = useState(today);
  const [apptView, setApptView] = useState<'list' | 'timeline'>('list');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [nowTop, setNowTop] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allAppts: any[] = cache.appointments || [];
  const isDemo = localStorage.getItem('np_demo') === '1';

  // Current time line
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const m = now.getHours() * 60 + now.getMinutes() - TL_START_H * 60;
      setNowTop(m * PX_PER_MIN);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  const openApptModal = (date?: string, time?: string) => {
    (window as any).openModal?.('apptModal', undefined, { date: date || selectedDate, time });
  };

  const openApptEdit = (id: string) => {
    (window as any).openModal?.('apptModal', id);
  };

  const handleDeleteAppt = async (id: string) => {
    if (!confirm('Xóa lịch hẹn này?')) return;
    try {
      const sb = (window as any).__supabase;
      if (!isDemo && sb) await sb.from('appointments').delete().eq('id', id);
      else {
        // Demo: update cache directly
        await dbUpdate('appointments', id, { status: 'cancelled' }, true);
      }
      toast('Đã xóa lịch hẹn', 'success');
    } catch { toast('Không thể xóa', 'error'); }
  };

  // Navigation
  const navPrev = () => {
    if (calView === 'month') {
      if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
      else setCalMonth(m => m - 1);
    } else if (calView === 'week') {
      const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() - 7);
      setSelectedDate(d.toISOString().split('T')[0]);
    } else {
      const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() - 1);
      setSelectedDate(d.toISOString().split('T')[0]);
    }
  };

  const navNext = () => {
    if (calView === 'month') {
      if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
      else setCalMonth(m => m + 1);
    } else if (calView === 'week') {
      const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() + 7);
      setSelectedDate(d.toISOString().split('T')[0]);
    } else {
      const d = new Date(selectedDate + 'T00:00:00'); d.setDate(d.getDate() + 1);
      setSelectedDate(d.toISOString().split('T')[0]);
    }
  };

  const navLabel = () => {
    if (calView === 'month') return new Date(calYear, calMonth).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
    if (calView === 'week') {
      const dates = getWeekDates(selectedDate);
      const first = new Date(dates[0]); const last = new Date(dates[6]);
      return `${first.getDate()}/${first.getMonth() + 1} – ${last.getDate()}/${last.getMonth() + 1}/${last.getFullYear()}`;
    }
    return new Date(selectedDate + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Drag-and-drop handlers
  const handleDrop = useCallback(async (newDate: string, slotMinutes: number) => {
    if (!dragId) return;
    const appt = allAppts.find(a => a.id === dragId);
    if (!appt) { setDragId(null); return; }
    const h = Math.floor(slotMinutes / 60);
    const m = slotMinutes % 60;
    const newDt = `${newDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    // Overlap check
    const conflict = allAppts.find(a => a.id !== dragId && (a.scheduled_at || a.datetime || '').startsWith(newDate) && Math.abs(new Date(a.scheduled_at || a.datetime).getTime() - new Date(newDt).getTime()) < (a.duration_mins || 60) * 60000);
    if (conflict) { toast('Trùng lịch! Vui lòng chọn giờ khác.', 'error'); setDragId(null); return; }
    try {
      await dbUpdate('appointments', dragId, { scheduled_at: newDt }, isDemo);
      toast('Đã cập nhật lịch hẹn', 'success');
    } catch { toast('Không thể cập nhật', 'error'); }
    setDragId(null);
  }, [dragId, allAppts, dbUpdate, isDemo]);

  // Render helpers
  const ApptBlock = ({ a, width, left, top, height }: any) => (
    <div
      draggable
      onDragStart={() => setDragId(a.id)}
      onClick={() => openApptEdit(a.id)}
      style={{ position: 'absolute', top, left, width, height, background: 'var(--brand-l)', border: '1.5px solid var(--brand-m)', borderRadius: '6px', padding: '3px 5px', cursor: 'grab', overflow: 'hidden', zIndex: 2, boxSizing: 'border-box' }}
    >
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {new Date(a.scheduled_at || a.datetime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} {a.customer_name}
      </div>
      {height > 30 && <div style={{ fontSize: '10px', color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(a.services || []).join(', ')}</div>}
    </div>
  );

  const TimelineGrid = ({ date, containerWidth }: { date: string; containerWidth: number }) => {
    const dayAppts = allAppts.filter(a => (a.scheduled_at || a.datetime || '').startsWith(date));
    const blocks = layoutBlocks(dayAppts, containerWidth);
    const isToday = date === today;
    return (
      <div
        style={{ position: 'relative', height: TL_HEIGHT, minWidth: 0 }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = e.clientY - rect.top;
          const mins = Math.round(y / PX_PER_MIN / 15) * 15 + TL_START_H * 60;
          handleDrop(date, Math.max(TL_START_H * 60, Math.min(mins, (TL_END_H - 1) * 60)));
        }}
        onClick={e => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = e.clientY - rect.top;
          const mins = Math.round(y / PX_PER_MIN / 15) * 15 + TL_START_H * 60;
          const h = Math.floor(mins / 60); const m = mins % 60;
          openApptModal(date, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }}
      >
        {/* Hour lines */}
        {Array.from({ length: TL_END_H - TL_START_H }, (_, i) => {
          const h = TL_START_H + i;
          const top = i * 60 * PX_PER_MIN;
          return (
            <React.Fragment key={h}>
              <div style={{ position: 'absolute', top, left: 0, right: 0, borderTop: '1px solid var(--bdr)', zIndex: 0 }} />
              <div style={{ position: 'absolute', top: top + 30 * PX_PER_MIN, left: 56, right: 0, borderTop: '1px dashed var(--bdr2)', zIndex: 0 }} />
              <div style={{ position: 'absolute', top: top - 7, left: 0, width: 48, fontSize: '10px', color: 'var(--ink4)', textAlign: 'right', paddingRight: '4px', userSelect: 'none', pointerEvents: 'none' }}>
                {String(h).padStart(2, '0')}:00
              </div>
            </React.Fragment>
          );
        })}
        {/* Current time */}
        {isToday && nowTop > 0 && nowTop < TL_HEIGHT && (
          <div style={{ position: 'absolute', top: nowTop, left: 44, right: 0, height: 2, background: 'var(--red)', zIndex: 3, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--red)' }} />
          </div>
        )}
        {/* Appointment blocks */}
        {blocks.map(b => <ApptBlock key={b.id} a={b} top={b.top} left={b.left} width={b.width} height={b.height} />)}
      </div>
    );
  };

  const DayList = ({ date }: { date: string }) => {
    const dayAppts = [...allAppts.filter(a => (a.scheduled_at || a.datetime || '').startsWith(date))].sort((a, b) => (a.scheduled_at || a.datetime || '').localeCompare(b.scheduled_at || b.datetime || ''));
    if (!dayAppts.length) return (
      <div className="card">
        <div className="empty">
          <div className="empty-ico">📅</div>
          <div className="empty-ttl">{t('Không có lịch hẹn')}</div>
          <div className="empty-sub">{t('Nhấn + hoặc chạm vào timeline để thêm')}</div>
        </div>
      </div>
    );
    return (
      <div className="card">
        {dayAppts.map((a: any) => (
          <div key={a.id} className="lrow" style={{ padding: '10px 14px', borderBottom: '1px solid var(--bdr)', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ minWidth: 44, fontSize: '13px', fontWeight: 700, color: 'var(--brand)', paddingTop: '2px' }}>{formatTime(a.scheduled_at || a.datetime)}</div>
            <Avatar name={a.customer_name} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{a.customer_name}</div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '2px' }}>{(a.services || []).join(', ') || '—'}</div>
              {(a.ref_images || []).length > 0 && (
                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                  {(a.ref_images as string[]).slice(0, 4).map((src, i) => (
                    <img key={i} src={src} alt="mẫu" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--bdr)' }} />
                  ))}
                  {(a.ref_images as string[]).length > 4 && (
                    <div style={{ width: 36, height: 36, borderRadius: 4, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--ink4)' }}>+{(a.ref_images as string[]).length - 4}</div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
              <Badge status={a.status} />
              <div style={{ display: 'flex', gap: '4px' }}>
                {a.status === 'scheduled' && <button className="btn ghost sm" style={{ fontSize: '12px', padding: '3px 7px' }} onClick={() => (window as any).openModal?.('orderModal', undefined, { apptId: a.id })}>🧾</button>}
                <button className="btn ghost sm" style={{ fontSize: '12px', padding: '3px 7px' }} onClick={() => openApptEdit(a.id)}>✏️</button>
                <button className="btn ghost sm" style={{ fontSize: '12px', padding: '3px 7px', color: 'var(--red)' }} onClick={() => handleDeleteAppt(a.id)}>🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Month view
  const monthCells = useMemo(() => getMonthDates(calYear, calMonth), [calYear, calMonth]);
  const apptsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    allAppts.forEach(a => {
      const d = (a.scheduled_at || a.datetime || '').slice(0, 10);
      if (d) map[d] = (map[d] || 0) + 1;
    });
    return map;
  }, [allAppts]);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const containerWidth = (containerRef.current?.offsetWidth || 360);

  return (
    <div className="screen active" ref={containerRef}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <button className="btn ghost sm icon" onClick={navPrev} style={{ width: 32, height: 32 }}>‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '14px', fontWeight: 700 }}>{navLabel()}</div>
        <button className="btn ghost sm icon" onClick={navNext} style={{ width: 32, height: 32 }}>›</button>
        <button className="btn ghost sm" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={() => { setSelectedDate(today); setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()); }}>{t('Hôm nay')}</button>
      </div>

      {/* View toggle: segmented control + (only on Day) compact icon toggle for List/Timeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div
          role="tablist"
          style={{
            display: 'inline-flex',
            background: 'var(--bg3, #F3F4F6)',
            borderRadius: 999,
            padding: 3,
            gap: 2,
            flex: 1,
          }}
        >
          {(['month', 'week', 'day'] as const).map(v => {
            const on = calView === v;
            return (
              <button
                key={v}
                role="tab"
                aria-selected={on}
                onClick={() => setCalView(v)}
                style={{
                  flex: 1,
                  border: 'none',
                  background: on ? 'var(--brand)' : 'transparent',
                  color: on ? '#fff' : 'var(--ink2, #374151)',
                  fontWeight: 600,
                  fontSize: 13,
                  padding: '6px 10px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  transition: 'background .15s',
                }}
              >
                {v === 'month' ? t('Tháng') : v === 'week' ? t('Tuần') : t('Ngày')}
              </button>
            );
          })}
        </div>
        {calView === 'day' && (
          <div
            style={{
              display: 'inline-flex',
              border: '1px solid var(--bdr)',
              borderRadius: 999,
              padding: 2,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setApptView('list')}
              aria-label={t('Danh sách')}
              title={t('Danh sách')}
              style={{
                width: 34, height: 30, padding: 0,
                background: apptView === 'list' ? 'var(--brand-l)' : 'transparent',
                color: apptView === 'list' ? 'var(--brand)' : 'var(--ink3, #6B7280)',
                border: 'none', borderRadius: 999, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
            </button>
            <button
              onClick={() => setApptView('timeline')}
              aria-label={t('Timeline')}
              title={t('Timeline')}
              style={{
                width: 34, height: 30, padding: 0,
                background: apptView === 'timeline' ? 'var(--brand-l)' : 'transparent',
                color: apptView === 'timeline' ? 'var(--brand)' : 'var(--ink3, #6B7280)',
                border: 'none', borderRadius: 999, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Month View */}
      {calView === 'month' && (
        <div className="card" style={{ padding: '8px' }}>
          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
            {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--ink4)', fontWeight: 600, padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {monthCells.map((ds, i) => {
              const isToday_ = ds === today;
              const isSel = ds === selectedDate;
              const count = ds ? apptsByDate[ds] || 0 : 0;
              const inMonth = ds ? parseInt(ds.slice(5, 7)) === calMonth + 1 : false;
              return (
                <div key={i} onClick={() => { if (ds) { setSelectedDate(ds); setCalView('day'); } }}
                  style={{ textAlign: 'center', padding: '6px 2px', borderRadius: '8px', cursor: ds ? 'pointer' : 'default', background: isSel ? 'var(--brand)' : isToday_ ? 'var(--brand-l)' : 'transparent', opacity: !ds || !inMonth ? 0.3 : 1, minHeight: 38 }}>
                  {ds && (
                    <>
                      <div style={{ fontSize: '13px', fontWeight: isSel || isToday_ ? 700 : 400, color: isSel ? 'white' : isToday_ ? 'var(--brand)' : 'var(--ink)' }}>{parseInt(ds.slice(8))}</div>
                      {count > 0 && <div style={{ width: 5, height: 5, borderRadius: '50%', background: isSel ? 'rgba(255,255,255,.7)' : 'var(--brand)', margin: '2px auto 0' }} />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day View */}
      {calView === 'day' && (
        <>
          {apptView === 'list' ? (
            <DayList date={selectedDate} />
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div ref={tlRef} style={{ overflowY: 'auto', maxHeight: '65dvh' }}>
                <TimelineGrid date={selectedDate} containerWidth={containerWidth} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Week View */}
      {calView === 'week' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Week header */}
          <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', borderBottom: '1px solid var(--bdr)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 4 }}>
            <div />
            {weekDates.map(ds => {
              const d = new Date(ds + 'T00:00:00');
              const isToday_ = ds === today;
              const isSel = ds === selectedDate;
              return (
                <div key={ds} onClick={() => { setSelectedDate(ds); setCalView('day'); }}
                  style={{ textAlign: 'center', padding: '6px 2px', cursor: 'pointer', background: isSel ? 'var(--brand-l)' : 'transparent', borderRadius: '6px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--ink4)' }}>{['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: isToday_ ? 'var(--brand)' : 'var(--ink)', lineHeight: 1.3 }}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>
          {/* Week timeline body */}
          <div style={{ overflowY: 'auto', maxHeight: '60dvh' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', position: 'relative', height: TL_HEIGHT }}>
              {/* Hour labels */}
              <div style={{ position: 'relative', height: TL_HEIGHT }}>
                {Array.from({ length: TL_END_H - TL_START_H }, (_, i) => (
                  <div key={i} style={{ position: 'absolute', top: i * 60 * PX_PER_MIN - 7, left: 0, width: 48, fontSize: '10px', color: 'var(--ink4)', textAlign: 'right', paddingRight: '4px', userSelect: 'none' }}>
                    {String(TL_START_H + i).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
              {weekDates.map(ds => {
                const dayAppts = allAppts.filter(a => (a.scheduled_at || a.datetime || '').startsWith(ds));
                const colW = (containerWidth - 56) / 7;
                const blocks = layoutBlocks(dayAppts, colW);
                const isToday_ = ds === today;
                return (
                  <div key={ds}
                    style={{ position: 'relative', height: TL_HEIGHT, borderLeft: '1px solid var(--bdr2)', background: isToday_ ? 'rgba(201,71,122,.02)' : 'transparent' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const mins = Math.round(y / PX_PER_MIN / 15) * 15 + TL_START_H * 60;
                      handleDrop(ds, Math.max(TL_START_H * 60, Math.min(mins, (TL_END_H - 1) * 60)));
                    }}
                    onClick={e => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const mins = Math.round(y / PX_PER_MIN / 15) * 15 + TL_START_H * 60;
                      const h = Math.floor(mins / 60); const m = mins % 60;
                      openApptModal(ds, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                    }}
                  >
                    {/* Hour lines */}
                    {Array.from({ length: TL_END_H - TL_START_H }, (_, i) => (
                      <React.Fragment key={i}>
                        <div style={{ position: 'absolute', top: i * 60 * PX_PER_MIN, left: 0, right: 0, borderTop: '1px solid var(--bdr)', zIndex: 0 }} />
                        <div style={{ position: 'absolute', top: (i * 60 + 30) * PX_PER_MIN, left: 0, right: 0, borderTop: '1px dashed var(--bdr2)', zIndex: 0 }} />
                      </React.Fragment>
                    ))}
                    {/* Current time */}
                    {isToday_ && nowTop > 0 && nowTop < TL_HEIGHT && (
                      <div style={{ position: 'absolute', top: nowTop, left: 0, right: 0, height: 2, background: 'var(--red)', zIndex: 3, pointerEvents: 'none' }} />
                    )}
                    {/* Blocks */}
                    {blocks.map(b => (
                      <div key={b.id} draggable onDragStart={() => setDragId(b.id)} onClick={e => { e.stopPropagation(); openApptEdit(b.id); }}
                        style={{ position: 'absolute', top: b.top, left: (b.col / b.totalCols) * (colW - 2), width: (colW - 2) / b.totalCols - 1, height: b.height, background: 'var(--brand-l)', border: '1.5px solid var(--brand-m)', borderRadius: '4px', padding: '2px 3px', overflow: 'hidden', zIndex: 2, cursor: 'grab', fontSize: '10px', fontWeight: 600, color: 'var(--brand)', lineHeight: 1.2 }}>
                        {new Date(b.scheduled_at || b.datetime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        {b.height > 25 && <div style={{ opacity: .8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.customer_name}</div>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
