import { createContext, ReactNode, useContext, useState, useEffect } from 'react';
import { t } from '@sdppp/common';
import { z } from 'zod';
import { createStore } from 'zustand';

const uploadImageInputSchema = z.object({
  type: z.literal('buffer').or(z.literal('token')).or(z.literal('resource')),
  tokenOrBuffer: z.any().optional(),
  resource: z.string(),
  resourceId: z.string().optional(),
  fileName: z.string(),
  mimeType: z.string().optional(),
});
export type UploadPassInput = z.infer<typeof uploadImageInputSchema>;

export type UploadPass = {
  getUploadFile: (signal?: AbortSignal) => Promise<UploadPassInput>;
  onUploaded?: (fileURL: string) => Promise<void>;
  onUploadError?: (error: any) => void;
};

interface UploadPassContextType {
  runUploadPassOnce: (pass: UploadPass) => Promise<string>;
  addUploadPass: (pass: UploadPass) => string;
  removeUploadPass: (pass: UploadPass) => void;
  cancelAllUploads: () => void;
  waitAllUploadPasses: (signal?: AbortSignal) => Promise<string[]>;
}

const UploadPassContext = createContext<UploadPassContextType | undefined>(undefined);

interface UploadPassProviderProps {
  children: ReactNode;
  uploader: (uploadInput: UploadPassInput, signal?: AbortSignal) => Promise<string>;
}

const createUploadPassesStore = () => createStore<{
  uploadPasses: UploadPass[];
  runningUploadPasses: { [id: string]: Promise<string> };
  abortControllers: { [id: string]: AbortController };
}>(() => ({
  uploadPasses: [],
  runningUploadPasses: {},
  abortControllers: {},
}));

export function UploadPassProvider({ children, uploader }: UploadPassProviderProps) {
  const [uploadPassesStore] = useState(createUploadPassesStore);
  useEffect(() => () => {
    Object.values(uploadPassesStore.getState().abortControllers).forEach((controller) => controller.abort());
  }, [uploadPassesStore]);
  const value: UploadPassContextType = {
    runUploadPassOnce: async (pass: UploadPass) => {
      if (!uploader) {
        throw new Error(t('upload_pass.error.uploader_missing', { defaultValue: 'Uploader not set' }));
      }
      const runID = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      const abortController = new AbortController();

      const promise = new Promise<string>(async (resolve, reject) => {
        try {
          const uploadInput = await pass.getUploadFile(abortController.signal);
          const fileURL = await uploader(uploadInput, abortController.signal);
          if (abortController.signal.aborted) throw new DOMException('Upload aborted', 'AbortError');
          if (pass.onUploaded) {
            await pass.onUploaded(fileURL);
          }
          resolve(fileURL);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            reject(error);
          } else {
            pass.onUploadError?.(error);
            reject(error);
          }
        } finally {
          uploadPassesStore.setState(state => {
            delete state.runningUploadPasses[runID];
            delete state.abortControllers[runID];
            return state;
          });
        }
      });

      uploadPassesStore.setState(state => {
        state.runningUploadPasses[runID] = promise;
        state.abortControllers[runID] = abortController;
        return state;
      });

      return await promise;
    },
    addUploadPass: (pass: UploadPass) => {
      const passId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      uploadPassesStore.setState(state => {
        state.uploadPasses.push(pass);
        return state;
      });
      return passId;
    },
    removeUploadPass: (pass: UploadPass) => {
      uploadPassesStore.setState(state => {
        state.uploadPasses = state.uploadPasses.filter(p => p !== pass);
        return state;
      });
    },
    cancelAllUploads: () => {
      const state = uploadPassesStore.getState();
      Object.values(state.abortControllers).forEach(controller => controller.abort());
      uploadPassesStore.setState(state => {
        state.runningUploadPasses = {};
        state.abortControllers = {};
        return state;
      });
    },
    waitAllUploadPasses: async (signal?: AbortSignal) => {
      if (!uploader) {
        throw new Error(t('upload_pass.error.uploader_missing', { defaultValue: 'Uploader not set' }));
      }
      const promisesFromUploadPasses = uploadPassesStore.getState().uploadPasses.map(async pass => {
        try {
          if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');
          const uploadInput = await pass.getUploadFile(signal);
          const fileURL = await uploader(uploadInput, signal);
          if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');
          if (pass.onUploaded) {
            await pass.onUploaded(fileURL);
          }
          return fileURL;
        } catch (error) {
          pass.onUploadError?.(error);
          throw error;
        }
      });
      const promisesFromRunningUploadPasses = Object.values(uploadPassesStore.getState().runningUploadPasses);
      // 等待整批收尾，避免首个失败提前释放表单，让剩余上传串入下一次生成。
      const results = await Promise.allSettled([...promisesFromUploadPasses, ...promisesFromRunningUploadPasses]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    },
  };

  return <UploadPassContext.Provider value={value}>{children}</UploadPassContext.Provider>;
}

export function useUploadPasses() {
  const ctx = useContext(UploadPassContext);
  if (!ctx) throw new Error('useUploadPasses must be used within an UploadPassProvider');
  return ctx;
}
