// 数字人类型定义

export type DigitalHumanStatus = 'pending' | 'training' | 'ready' | 'failed';

export interface DigitalHuman {
  id: string;
  name: string;
  facePhotoUrl: string; // 大头照片
  halfBodyPhotoUrl: string; // 半身照片
  fullBodyPhotoUrl: string; // 全身照片
  voiceSampleUrl: string; // 声音样本音频文件
  voiceCloneId?: string; // YunTTS 声音克隆 ID
  imageModelId?: string; // KIE 形象模型 ID
  status: DigitalHumanStatus;
  createdAt: string;
}

export interface CreateDigitalHumanRequest {
  name: string;
  facePhotoUrl: string;
  halfBodyPhotoUrl: string;
  fullBodyPhotoUrl: string;
  voiceSampleUrl: string;
}

export interface UploadResponse {
  url: string;
  filename: string;
  size: number;
  mimetype: string;
}
