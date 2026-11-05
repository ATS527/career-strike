import { useCallback, useEffect, useState } from 'react';
import { api, type SourceBoard, type Task } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Link } from '../../router';
import { AddBoardForm } from './-components/AddBoardForm';
import { BoardRow } from './-components/BoardRow';

export function Sources() {
  const [boards, setBoards] = useState<SourceBoard[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tasks, setTasks] = useState<Record<string, Task>>({});

  const load = useCallback(async () => {
    try {
      const res = await api<{ boards: SourceBoard[] }>('/api/sources');
      setBoards(res.boards);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const active = Object.values(tasks).filter((t) => t.state === 'RUNNING' || t.state === 'QUEUED');
  const activeKey = active.map((t) => t.id).join(',');
  useEffect(() => {
    if (active.length === 0) return;
    const timer = window.setInterval(async () => {
      const updates = await Promise.all(
        active.map((t) =>
          api<{ task: Task }>(`/api/tasks/${t.id}`)
            .then((r) => r.task)
            .catch(() => t),
        ),
      );
      setTasks((prev) => ({ ...prev, ...Object.fromEntries(updates.map((t) => [t.id, t])) }));
      if (updates.some((t) => t.state !== 'RUNNING' && t.state !== 'QUEUED')) void load();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeKey, load]);

  const track = (task: Task | null): void => {
    if (task) setTasks((prev) => ({ ...prev, [task.id]: task }));
  };

  const taskFor = (board: SourceBoard): Task | undefined =>
    Object.values(tasks).find((t) => t.kind === `discover:${board.id}`);

  return (
    <>
      <PageHeader
        eyebrow={
          <span>
            <Link href="/opportunities">Opportunities</Link> / Job boards
          </span>
        }
        title="Job boards you monitor"
        lede="Career Strike reads public job boards hosted on Greenhouse, Lever and Ashby directly from each company’s official listing. Nothing is sent about you."
      />

      <AddBoardForm
        onAdded={(task) => {
          track(task);
          void load();
        }}
      />

      {loadError && <ErrorPanel message="Job boards could not be loaded." onRetry={() => void load()} />}
      {!boards && !loadError && <Loading label="Loading job boards" />}
      {boards && boards.length === 0 && (
        <p className="text-sm text-muted-foreground italic py-4">No job boards yet. Add one above.</p>
      )}
      {boards && boards.length > 0 && (
        <ul className="space-y-3" data-testid="board-list">
          {boards.map((b) => (
            <BoardRow key={b.id} board={b} task={taskFor(b)} onTask={track} onRemoved={() => void load()} />
          ))}
        </ul>
      )}
    </>
  );
}

export default Sources;
