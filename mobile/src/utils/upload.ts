import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api.config';

export type UploadResult<T = any> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Upload a local file URI as multipart/form-data to an authenticated endpoint.
 *
 * Uses fetch() by default because it handles FormData + Content-Type boundaries
 * correctly on React Native. If `onProgress` is provided, switches to XHR
 * because fetch() on RN does not expose upload progress events.
 *
 * The server's success shape is assumed to be { success: true, data: T }.
 * On failure, returns { ok: false, error } with whatever error message the
 * server provided (or a fallback).
 */
export async function uploadMultipart<T = any>(
    path: string,
    fileUri: string,
    fieldName = 'image',
    extraFields?: Record<string, string>,
    onProgress?: (percent: number) => void,
): Promise<UploadResult<T>> {
    try {
        const token = await AsyncStorage.getItem('token');
        const form = new FormData();
        const filename = fileUri.split('/').pop() || `upload-${Date.now()}.jpg`;
        const ext = (filename.split('.').pop() || 'jpg').toLowerCase();
        const mime =
            ext === 'png' ? 'image/png' :
            ext === 'webp' ? 'image/webp' :
            'image/jpeg';
        // React Native's FormData accepts { uri, name, type }.
        form.append(fieldName, { uri: fileUri, name: filename, type: mime } as any);
        if (extraFields) {
            for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
        }
        if (onProgress) {
            return await uploadWithXHR<T>(path, form, token, onProgress);
        }
        const res = await fetch(`${API_BASE_URL}${path}`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                // Do NOT set Content-Type — fetch + FormData sets the correct multipart boundary automatically.
            },
            body: form as any,
        });
        const text = await res.text();
        if (!res.ok) {
            let msg = `Upload failed (${res.status})`;
            try {
                const j = JSON.parse(text);
                if (j?.error) msg = j.error;
            } catch {
                // non-JSON body — stick with the generic message
            }
            return { ok: false, error: msg };
        }
        try {
            const parsed = JSON.parse(text);
            return { ok: true, data: (parsed?.data ?? parsed) as T };
        } catch {
            return { ok: false, error: 'Invalid server response' };
        }
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Upload failed' };
    }
}

function uploadWithXHR<T>(
    path: string,
    form: FormData,
    token: string | null,
    onProgress: (p: number) => void,
): Promise<UploadResult<T>> {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE_URL}${path}`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const parsed = JSON.parse(xhr.responseText);
                    resolve({ ok: true, data: (parsed?.data ?? parsed) as T });
                } catch {
                    resolve({ ok: false, error: 'Invalid server response' });
                }
            } else {
                let msg = `Upload failed (${xhr.status})`;
                try {
                    const j = JSON.parse(xhr.responseText);
                    if (j?.error) msg = j.error;
                } catch {}
                resolve({ ok: false, error: msg });
            }
        };
        xhr.onerror = () => resolve({ ok: false, error: 'Network error during upload' });
        xhr.send(form);
    });
}
