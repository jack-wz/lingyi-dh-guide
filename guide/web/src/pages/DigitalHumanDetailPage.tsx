import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IconMic } from '../components/Icons';
import ConfirmDialog from '../components/ConfirmDialog';

interface DigitalHuman {
  id: string;
  name: string;
  face_photo_url: string;
  half_body_photo_url: string;
  full_body_photo_url: string;
  voice_sample_url: string;
  voice_clone_id?: string;
  image_model_id?: string;
  provider_job_id?: string;
  training_error?: string;
  last_trained_at?: string;
  status: string;
  created_at: string;
}

function VoiceRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const stopRecording = () => {
    mediaRef.current?.stop();
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (timerRef.current) window.clearInterval(timerRef.current);
    setRecording(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecorded(new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' }));
        setSeconds(0);
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      console.error('Mic access failed', e);
      alert('无法访问麦克风，请检查浏览器权限');
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={recording ? stopRecording : startRecording}
        className={`px-4 py-2 rounded-lg text-sm ${recording ? 'bg-destructive text-white' : 'bg-brand-blue text-white'}`}
      >
        {recording ? `停止录制 ${seconds}s` : '开始录制'}
      </button>
      <span className="text-xs text-muted-foreground">建议录制 8–20 秒清晰口播</span>
    </div>
  );
}

function PhotoUpload({ label, value, onChange, onDelete }: { label: string; value: string; onChange: (url: string) => void; onDelete?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: formData });
      const data = await res.json();
      onChange(data.url);
    } catch (e) {
      console.error('Upload failed', e);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-brand-blue transition">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
      />
      {value ? (
        <div className="relative">
          <img src={value} alt={label} className="w-32 h-32 object-cover rounded-lg mx-auto" />
          <div className="flex items-center justify-center gap-3 mt-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="text-sm text-brand-blue hover:text-blue-800"
            >
              替换
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className="text-sm text-red-500 hover:text-red-700"
              >
                删除
              </button>
            )}
          </div>
        </div>
      ) : (
        <button onClick={() => inputRef.current?.click()} className="py-4" disabled={uploading}>
          {uploading ? (
            <span className="text-muted-foreground">上传中...</span>
          ) : (
            <>
              <div className="text-3xl mb-1">📷</div>
              <p className="text-sm text-muted-foreground">点击上传{label}</p>
            </>
          )}
        </button>
      )}
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

export default function DigitalHumanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dh, setDh] = useState<DigitalHuman | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [messageDialog, setMessageDialog] = useState<{ title: string; message: string; destructive?: boolean } | null>(null);
  const [deletePhotoField, setDeletePhotoField] = useState<string | null>(null);
  const [deleteVoice, setDeleteVoice] = useState(false);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const dhRef = useRef<DigitalHuman | null>(null);

  const fetchHuman = async () => {
    try {
      const res = await fetch(`/api/digital-humans/${id}`);
      const data = await res.json();
      dhRef.current = data;
      setDh(data);
      return data;
    } catch (e) {
      console.error('Failed to fetch', e);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchHuman();
      if (cancelled) return;
      if (data) setDh(data);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 训练中时自动轮询状态
  const dhStatus = dh?.status;
  useEffect(() => {
    if (dhStatus !== 'training') return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/digital-humans/${id}`);
      const data = await res.json();
      dhRef.current = data;
      setDh(data);
      if (data.status !== 'training') {
        clearInterval(timer);
        console.log(`[Train] 训练结束, 状态: ${data.status}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [dhStatus, id]);

  const updateField = async (field: string, value: string) => {
    try {
      await fetch(`/api/digital-humans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      fetchHuman();
    } catch (e) {
      console.error('Update failed', e);
    }
  };

  const handleVoiceUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: formData });
      const data = await res.json();
      updateField('voice_sample_url', data.url);
    } catch (e) {
      console.error('Upload failed', e);
    }
  };

  const confirmDeletePhoto = () => {
    if (deletePhotoField) {
      updateField(deletePhotoField, '');
      setDeletePhotoField(null);
    }
  };

  const confirmDeleteVoice = () => {
    updateField('voice_sample_url', '');
    setDeleteVoice(false);
  };

  const triggerTrain = async () => {
    try {
      const res = await fetch(`/api/digital-humans/${id}/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'cenker', async: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessageDialog({ title: '素材校验失败', message: err.error || '请补齐照片和声音样本后重试。', destructive: true });
      }
      fetchHuman();
    } catch (e) {
      console.error('Train failed', e);
      setMessageDialog({ title: '训练请求失败', message: '无法提交训练任务，请稍后重试。', destructive: true });
    }
  };

  const deleteHuman = async () => {
    if (!dh) return;
    try {
      const res = await fetch(`/api/digital-humans/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      navigate('/digital-humans');
    } catch (err) {
      console.error('Failed to delete', err);
      setMessageDialog({ title: '删除失败', message: '删除数字人失败，请重试。', destructive: true });
    }
  };

  if (loading) return <div className="text-center py-20 text-muted-foreground">加载中...</div>;
  if (!dh) return <div className="text-center py-20 text-muted-foreground">数字人不存在</div>;

  const canTrain = dh.face_photo_url && dh.half_body_photo_url && dh.full_body_photo_url && dh.voice_sample_url;
  const statusLabel = dh.status === 'ready'
    ? '就绪'
    : dh.status === 'training'
    ? '训练中'
    : dh.status === 'failed'
    ? '失败'
    : '缺素材';
  const trainLabel = dh.status === 'ready'
    ? '重新训练'
    : dh.status === 'training'
    ? '训练中...'
    : '开始训练';

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => navigate('/digital-humans')} className="text-brand-blue hover:text-blue-800 mb-4 inline-block">
        ← 返回列表
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{dh.name}</h1>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="px-4 py-2 text-sm text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition"
        >
          删除数字人
        </button>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-foreground/80 mb-1">名称</label>
        <input
          type="text"
          defaultValue={dh.name}
          onBlur={(e) => updateField('name', e.target.value)}
          className="border border-border rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-ring focus:border-ring"
        />
      </div>

      <h2 className="text-lg font-semibold text-foreground/90 mb-3">照片上传</h2>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <PhotoUpload label="大头照片" value={dh.face_photo_url} onChange={(url) => updateField('face_photo_url', url)} onDelete={() => setDeletePhotoField('face_photo_url')} />
        <PhotoUpload label="半身照片" value={dh.half_body_photo_url} onChange={(url) => updateField('half_body_photo_url', url)} onDelete={() => setDeletePhotoField('half_body_photo_url')} />
        <PhotoUpload label="全身照片" value={dh.full_body_photo_url} onChange={(url) => updateField('full_body_photo_url', url)} onDelete={() => setDeletePhotoField('full_body_photo_url')} />
      </div>

      <h2 className="text-lg font-semibold text-foreground/90 mb-1">声音样本（导购员端录制 5–30 秒）</h2>
      <p className="text-xs text-muted-foreground mb-3">将用于 MOSI Studio / 云声配音 克隆您的专属音色</p>
      <VoiceRecorder onRecorded={handleVoiceUpload} />
      <div className="border-2 border-dashed border-border rounded-xl p-4 text-center mb-6 mt-3">
        <input
          ref={voiceInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleVoiceUpload(e.target.files[0])}
        />
        {dh.voice_sample_url ? (
          <div>
            <audio src={dh.voice_sample_url} controls className="mx-auto mb-2" />
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => voiceInputRef.current?.click()} className="text-sm text-brand-blue hover:text-blue-800">
                替换音频
              </button>
              <button onClick={() => setDeleteVoice(true)} className="text-sm text-red-500 hover:text-red-700">
                删除音频
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => voiceInputRef.current?.click()}>
            <div className="text-3xl mb-1 text-muted-foreground"><IconMic size={32} /></div>
            <p className="text-sm text-muted-foreground">点击上传声音样本</p>
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 p-4 bg-secondary rounded-xl">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            资产状态：
            <span className={`font-medium ${dh.status === 'ready' ? 'text-green-600' : dh.status === 'training' ? 'text-brand-blue' : dh.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
              {statusLabel}
            </span>
          </p>
          {dh.voice_clone_id && <p className="text-xs text-muted-foreground">声音模型: {dh.voice_clone_id}</p>}
          {dh.image_model_id && <p className="text-xs text-muted-foreground">形象模型: {dh.image_model_id}</p>}
          {dh.provider_job_id && <p className="text-xs text-muted-foreground">服务商任务：{dh.provider_job_id}</p>}
          {dh.last_trained_at && <p className="text-xs text-muted-foreground">最近训练: {new Date(dh.last_trained_at).toLocaleString()}</p>}
          {dh.training_error && <p className="text-xs text-destructive">{dh.training_error}</p>}
        </div>
        <button
          onClick={triggerTrain}
          disabled={!canTrain || dh.status === 'training'}
          className="px-4 py-2 bg-brand-purple text-primary-foreground rounded-lg hover:opacity-90 disabled:bg-muted disabled:cursor-not-allowed transition"
        >
          {trainLabel}
        </button>
      </div>

      {dh.status === 'ready' && (
        <div className="mt-4 p-4 border border-brand-green/30 rounded-xl bg-brand-green/5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">数字人已就绪，可在编辑器中选用并生成导购视频。</p>
          <button
            type="button"
            onClick={() => {
              const lastEditor = localStorage.getItem('guide-last-editor-id');
              if (lastEditor) navigate(`/editor/${lastEditor}?dh_id=${dh.id}`);
              else navigate('/');
            }}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            用此数字人继续编辑
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletePhotoField)}
        title="删除照片"
        message={deletePhotoField ? `确定删除「${deletePhotoField === 'face_photo_url' ? '大头照片' : deletePhotoField === 'half_body_photo_url' ? '半身照片' : '全身照片'}」吗？` : ''}
        confirmLabel="删除"
        destructive
        onConfirm={confirmDeletePhoto}
        onCancel={() => setDeletePhotoField(null)}
      />
      <ConfirmDialog
        open={deleteVoice}
        title="删除声音样本"
        message="确定删除当前声音样本吗？删除后该数字人将无法用于语音克隆。"
        confirmLabel="删除"
        destructive
        onConfirm={confirmDeleteVoice}
        onCancel={() => setDeleteVoice(false)}
      />
      <ConfirmDialog
        open={showDeleteDialog}
        title="删除数字人"
        message={`确定删除数字人「${dh.name}」吗？关联的渲染任务也会一并删除。`}
        confirmLabel="删除"
        destructive
        onConfirm={deleteHuman}
        onCancel={() => setShowDeleteDialog(false)}
      />
      <ConfirmDialog
        open={Boolean(messageDialog)}
        title={messageDialog?.title || ''}
        message={messageDialog?.message || ''}
        confirmLabel="知道了"
        destructive={messageDialog?.destructive}
        onConfirm={() => setMessageDialog(null)}
        onCancel={() => setMessageDialog(null)}
      />
    </div>
  );
}
