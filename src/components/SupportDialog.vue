<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { Maximize2, X } from "@lucide/vue";

const props = defineProps<{ language: "zh" | "en" }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const imageDialog = ref<HTMLDialogElement | null>(null);
const imageScroll = ref<HTMLDivElement | null>(null);
const method = ref<"wechat" | "alipay">("wechat");
const zh = computed(() => props.language === "zh");
const methodName = computed(() => method.value === "wechat"
  ? (zh.value ? "微信支付" : "WeChat Pay")
  : (zh.value ? "支付宝" : "Alipay"));
const imageSource = computed(() => `${import.meta.env.BASE_URL}support/${method.value}.jpg`);
const imageAlt = computed(() => zh.value ? `${methodName.value}收款码` : `${methodName.value} payment QR code`);
let opener: HTMLElement | null = null;
let disposed = false;
let backdropStart: HTMLDialogElement | null = null;

function isOutside(event: MouseEvent, element: HTMLDialogElement) {
  const rect = element.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right
    || event.clientY < rect.top || event.clientY > rect.bottom;
}

function startBackdropClick(event: PointerEvent) {
  const element = event.currentTarget as HTMLDialogElement;
  backdropStart = isOutside(event, element) ? element : null;
}

function closeFromBackdrop(event: MouseEvent) {
  const element = event.currentTarget as HTMLDialogElement;
  if (backdropStart === element && isOutside(event, element)) element.close();
  backdropStart = null;
}

function closeWithEscape(event: KeyboardEvent) {
  // Native close-watcher groups can dismiss both dialogs for one Escape press.
  if (!event.repeat) (event.currentTarget as HTMLDialogElement).close();
}

async function enlargeImage() {
  imageDialog.value?.showModal();
  await nextTick();
  centerEnlargedImage();
}

function centerEnlargedImage() {
  const scroll = imageScroll.value;
  if (!scroll || !imageDialog.value?.open) return;
  scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) / 2;
  scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
}

onMounted(() => {
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.value?.showModal();
});

onBeforeUnmount(() => {
  disposed = true;
  imageDialog.value?.close();
  dialog.value?.close();
  if (opener?.isConnected) opener.focus({ preventScroll: true });
});
</script>

<template>
  <dialog
    ref="dialog"
    class="support-dialog"
    aria-labelledby="support-title"
    aria-describedby="support-description"
    @pointerdown="startBackdropClick"
    @click="closeFromBackdrop"
    @keydown.esc.prevent.stop="closeWithEscape"
    @close="!disposed && emit('close')"
  >
    <header class="support-header">
      <h2 id="support-title">{{ zh ? '请开发者喝杯饮料' : 'Buy the developer a drink' }}</h2>
      <button class="icon-button small" type="button" :aria-label="zh ? '关闭窗口' : 'Close window'" autofocus @click="dialog?.close()">
        <X :size="18" aria-hidden="true" />
      </button>
    </header>
    <p id="support-description">{{ zh ? '如果 TaskWeave 对你有帮助，也可以请开发者喝杯饮料。感谢你的支持。' : 'If TaskWeave has been helpful, you can buy the developer a drink. Thank you for your support.' }}</p>
    <div class="support-methods" role="group" :aria-label="zh ? '支付方式' : 'Payment method'">
      <button type="button" :aria-pressed="method === 'wechat'" @click="method = 'wechat'">{{ zh ? '微信支付' : 'WeChat Pay' }}</button>
      <button type="button" :aria-pressed="method === 'alipay'" @click="method = 'alipay'">{{ zh ? '支付宝' : 'Alipay' }}</button>
    </div>
    <button class="support-qr-button" type="button" :aria-label="zh ? `放大${imageAlt}` : `Enlarge ${imageAlt}`" @click="enlargeImage">
      <img :src="imageSource" :alt="imageAlt" />
      <span><Maximize2 :size="14" aria-hidden="true" />{{ zh ? '放大查看' : 'Enlarge' }}</span>
    </button>
    <p class="support-scan-hint">{{ zh ? `用${methodName}扫一扫，金额随意。` : `Scan with ${methodName}. Any amount is welcome.` }}</p>
  </dialog>

  <dialog
    ref="imageDialog"
    class="support-image-dialog"
    :aria-label="imageAlt"
    @pointerdown="startBackdropClick"
    @click="closeFromBackdrop"
    @keydown.esc.prevent.stop="closeWithEscape"
  >
    <header class="support-header">
      <h2>{{ imageAlt }}</h2>
      <button class="icon-button small" type="button" :aria-label="zh ? '关闭大图' : 'Close enlarged image'" autofocus @click="imageDialog?.close()">
        <X :size="18" aria-hidden="true" />
      </button>
    </header>
    <div ref="imageScroll" class="support-image-scroll" tabindex="0" :aria-label="zh ? '收款码大图，可滚动查看' : 'Enlarged payment QR code, scroll to view'">
      <img :src="imageSource" :alt="imageAlt" @load="centerEnlargedImage" />
    </div>
  </dialog>
</template>

<style scoped>
.support-dialog,
.support-image-dialog {
  box-sizing: border-box;
  width: min(460px, calc(100vw - 32px));
  max-width: none;
  max-height: calc(100dvh - 32px);
  overflow: auto;
  margin: auto;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px;
  background: var(--panel-bg);
  color: var(--text);
  box-shadow: 0 24px 80px rgb(0 0 0 / 22%);
}

.support-dialog::backdrop,
.support-image-dialog::backdrop { background: rgb(0 0 0 / 45%); }
.support-dialog[open],
.support-image-dialog[open] { animation: support-enter var(--motion-normal, 180ms) var(--motion-ease, ease); }
.support-dialog[open]::backdrop,
.support-image-dialog[open]::backdrop { animation: support-backdrop-enter var(--motion-normal, 180ms) ease; }
.support-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.support-header h2 { margin: 0; color: var(--heading); font-size: 18px; font-weight: 600; }
.support-header button { flex: 0 0 auto; }
#support-description { margin: 10px 0 20px; color: var(--subtle); font-size: 13px; line-height: 1.7; }
.support-methods { display: flex; gap: 4px; margin-bottom: 16px; border: 1px solid var(--border); border-radius: 9px; padding: 4px; background: var(--field-bg); }
.support-methods button { flex: 1; border: 1px solid transparent; border-radius: 6px; padding: 8px; background: transparent; color: var(--subtle); font: inherit; font-size: 13px; cursor: pointer; transition: background-color var(--motion-fast, 120ms) ease, color var(--motion-fast, 120ms) ease; }
.support-methods button[aria-pressed="true"] { border-color: var(--border); background: var(--panel-bg); color: var(--heading); box-shadow: 0 1px 3px rgb(0 0 0 / 5%); }
.support-methods button:hover { color: var(--heading); }
.support-qr-button { display: flex; width: 100%; flex-direction: column; align-items: center; gap: 10px; border: 0; padding: 0; background: transparent; color: var(--subtle); cursor: zoom-in; }
.support-qr-button img { display: block; width: auto; max-width: 100%; height: auto; max-height: 52dvh; border-radius: 8px; object-fit: contain; }
.support-qr-button span { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.support-scan-hint { margin: 14px 0 0; text-align: center; color: var(--subtle); font-size: 12px; line-height: 1.6; }
.support-dialog button:focus-visible,
.support-image-dialog :focus-visible { outline: 2px solid var(--primary-border); outline-offset: 3px; }
.support-image-dialog { width: min(820px, calc(100vw - 32px)); padding: 18px; }
.support-image-dialog .support-header { margin-bottom: 14px; }
.support-image-dialog .support-header h2 { font-size: 15px; }
.support-image-scroll { max-height: calc(100dvh - 130px); overflow: auto; border-radius: 6px; background: #fff; }
.support-image-scroll img { display: block; width: 100%; height: auto; margin: auto; }
@keyframes support-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes support-backdrop-enter { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 480px) { .support-dialog { padding: 20px; } .support-header h2 { font-size: 17px; } .support-image-dialog { padding: 14px; } }
@media (prefers-reduced-motion: reduce) {
  .support-dialog[open], .support-image-dialog[open], .support-dialog[open]::backdrop, .support-image-dialog[open]::backdrop { animation: none; }
  .support-methods button { transition: none; }
}
</style>
