import { stepPhotoResponseSchema } from '@family/shared';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { resizeStepPhoto } from '../recipe-import/resize-photo';

/**
 * Качва снимка на стъпка веднага при избора: смалява я (`resizeStepPhoto`) и я праща като формуляр с файл в полето
 * `photo`; резултатът е id-то, към което стъпката сочи от „Запази“ нататък. Отказите на api-то (413 `photo_too_large`,
 * 415 `unsupported_photo`) идват като `ApiError` с текст за екрана.
 */
export function useUploadStepPhoto() {
  return useMutation({
    mutationFn: async (photo: Blob) => {
      const form = new FormData();
      form.append('photo', await resizeStepPhoto(photo), 'photo.jpg');
      const body = await apiFetch('/step-photos', stepPhotoResponseSchema, {
        method: 'POST',
        body: form,
      });
      return body.photo.id;
    },
  });
}
