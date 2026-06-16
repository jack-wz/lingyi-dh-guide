import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconUser, IconPlus, IconTrash } from '../components/Icons';
import ConfirmDialog from '../components/ConfirmDialog';
import TextInputDialog from '../components/TextInputDialog';
import { formatApiErrorMessage, parseApiErrorResponse } from '../utils/apiError';

interface DigitalHuman {
  id: string;
  name: string;
  face_photo_url: string;
  status: string;
  created_at: string;
}

export default function DigitalHumanListPage() {
  const [humans, setHumans] = useState<DigitalHuman[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DigitalHuman | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  const fetchHumans = async () => {
    try {
      const res = await fetch('/api/digital-humans');
      if (!res.ok) {
        const body = await parseApiErrorResponse(res);
        throw new Error(formatApiErrorMessage(body, '加载数字人列表失败'));
      }
      setHumans(await res.json());
    } catch (e) {
      console.error('Failed to fetch digital humans', e);
      setErrorMessage(e instanceof Error ? e.message : '加载数字人列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHumans(); }, []);

  const deleteHuman = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget({ id, name } as DigitalHuman);
  };

  const confirmDeleteHuman = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/digital-humans/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await parseApiErrorResponse(res);
        throw new Error(formatApiErrorMessage(body, '删除数字人失败'));
      }
      setHumans((prev) => prev.filter((h) => h.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete digital human', err);
      setErrorMessage(err instanceof Error ? err.message : '删除失败，请重试');
    }
  };

  const createHuman = async (name: string) => {
    try {
      const res = await fetch('/api/digital-humans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await parseApiErrorResponse(res);
        throw new Error(formatApiErrorMessage(body, '创建数字人失败'));
      }
      const dh = await res.json();
      setShowCreateDialog(false);
      navigate(`/digital-humans/${dh.id}`);
    } catch (e) {
      console.error('Failed to create', e);
      setErrorMessage(e instanceof Error ? e.message : '创建失败，请重试');
    }
  };

  const statusLabels: Record<string, string> = {
    pending: '待上传', pending_assets: '缺素材', training: '训练中', ready: '就绪', failed: '失败',
  };
  const statusColors: Record<string, string> = {
    pending: 'bg-secondary text-muted-foreground',
    pending_assets: 'bg-secondary text-muted-foreground',
    training: 'bg-brand-blue/15 text-brand-blue',
    ready: 'bg-brand-green/15 text-brand-green',
    failed: 'bg-destructive/15 text-destructive',
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">数字人管理</h1>
        <button onClick={() => setShowCreateDialog(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
          + 新建数字人
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">加载中...</div>
      ) : humans.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-muted-foreground mb-4 flex justify-center"><IconUser size={48} /></div>
          <p className="text-muted-foreground mb-4">还没有数字人，创建后可上传照片与声音样本进行训练</p>
          <button onClick={() => setShowCreateDialog(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
            创建第一个数字人
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {humans.map((h) => (
            <div
              key={h.id}
              onClick={() => navigate(`/digital-humans/${h.id}`)}
              className="border border-border rounded-xl p-4 hover:shadow-lg transition cursor-pointer bg-card relative group"
            >
              <button
                onClick={(e) => deleteHuman(h.id, h.name, e)}
                className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition"
                title="删除"
              >
                ✕
              </button>
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-200 to-blue-200 mx-auto mb-3 flex items-center justify-center overflow-hidden">
                {h.face_photo_url ? (
                  <img src={h.face_photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl text-muted-foreground"><IconUser size={24} /></span>
                )}
              </div>
              <h3 className="text-center font-medium text-foreground mb-1">{h.name}</h3>
              <div className="text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[h.status] || ''}`}>
                  {statusLabels[h.status] || h.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <TextInputDialog
        open={showCreateDialog}
        title="新建数字人"
        message="创建后进入资产上传和训练准备页。"
        label="数字人名称"
        placeholder="例如：培训讲师"
        confirmLabel="创建"
        onConfirm={createHuman}
        onCancel={() => setShowCreateDialog(false)}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除数字人"
        message={`确定删除数字人「${deleteTarget?.name || ''}」吗？关联的渲染任务也会一并删除。`}
        confirmLabel="删除"
        destructive
        onConfirm={confirmDeleteHuman}
        onCancel={() => setDeleteTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(errorMessage)}
        title="操作失败"
        message={errorMessage}
        confirmLabel="知道了"
        onConfirm={() => setErrorMessage('')}
        onCancel={() => setErrorMessage('')}
      />
    </div>
  );
}
