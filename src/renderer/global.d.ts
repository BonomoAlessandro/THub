import type { THubApi } from '../shared/types';

declare global {
  interface Window {
    thub: THubApi;
  }
}
