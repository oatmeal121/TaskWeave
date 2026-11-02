<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, Maximize2, Search, X } from "@lucide/vue";
import { userGuides } from "../help/userGuide";
import type { GuideDestination, GuideImage, GuideLanguage, GuideSection } from "../help/userGuide";

const props = defineProps<{ language: GuideLanguage; runningInTauri: boolean; articleId: string }>();
const emit = defineEmits<{
  navigate: [destination: GuideDestination];
  "update:articleId": [id: string];
}>();
const query = ref("");
const contentsExpanded = ref(false);
const imageDialog = ref<HTMLDialogElement | null>(null);
const enlargedImage = ref<GuideImage | null>(null);
const expandedDetails = ref<string[]>([]);
const guide = computed(() => userGuides[props.language]);
const article = computed(() => guide.value.articles.find((item) => item.id === props.articleId));
const articleSections = computed(() => (article.value?.sections ?? []).map((section, index) => ({
  ...section,
  image: section.image ?? (index === 0 ? article.value?.image : undefined),
})));
const nextArticle = computed(() => {
  const index = guide.value.articles.findIndex((item) => item.id === article.value?.id);
  return index >= 0 ? guide.value.articles[index + 1] : undefined;
});
const group = computed(() => guide.value.groups.find((item) => item.id === article.value?.group));
const isSearching = computed(() => query.value.trim().length > 0);
const results = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return guide.value.articles.map((item) => {
    const text = [
      item.title, item.summary, item.entry, item.keywords,
      ...item.sections.flatMap((section) => [
        section.title, ...contentText(section),
        ...(section.details ? [section.details.title, ...contentText(section.details)] : []),
      ]),
      ...guide.value.questions.filter((question) => question.articleId === item.id).map((question) => question.question),
    ].join(" ").toLocaleLowerCase();
    const matches = terms.every((term) => text.includes(term));
    const score = terms.reduce((value, term) => value + (item.title.toLocaleLowerCase().includes(term) ? 3 : 0) + (item.keywords.toLocaleLowerCase().includes(term) ? 2 : 0), 0);
    return { item, matches, score };
  }).filter((entry) => entry.matches).sort((a, b) => b.score - a.score).map((entry) => entry.item);
});
const relatedArticles = computed(() => (article.value?.related ?? [])
  .map((id) => guide.value.articles.find((item) => item.id === id))
  .filter((item) => item !== undefined)
  .filter((item) => item.id !== nextArticle.value?.id));

function contentText(content: Pick<GuideSection, "body" | "steps" | "table" | "note">) {
  return [
    ...(content.body ?? []), content.note ?? "",
    ...(content.steps ?? []).flatMap((step) => [step.action, step.result ?? ""]),
    ...(content.table?.headers ?? []), ...(content.table?.rows ?? []).flat(),
  ];
}

function setDetailsOpen(id: string, event: Event) {
  const open = (event.target as HTMLDetailsElement).open;
  if (expandedDetails.value.includes(id) === open) return;
  expandedDetails.value = open
    ? [...expandedDetails.value, id]
    : expandedDetails.value.filter((value) => value !== id);
}

function articlesInGroup(id: string) {
  return guide.value.articles.filter((item) => item.group === id);
}

function sectionId(articleId: string, id: string) {
  return "manual-section-" + articleId + "-" + id;
}

function focusHeading(id: string) {
  const heading = document.getElementById(id);
  heading?.scrollIntoView({ block: "start" });
  heading?.focus({ preventScroll: true });
}

function selectArticle(id: string, section?: string) {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const selected = guide.value.articles.find((item) => item.id === id);
  expandedDetails.value = (selected?.sections ?? []).filter((item) => {
    if (!item.details) return false;
    if (item.id === section) return true;
    const text = [item.details.title, ...contentText(item.details)].join(" ").toLocaleLowerCase();
    return terms.some((term) => text.includes(term));
  }).map((item) => item.id);
  const targetSection = section ?? expandedDetails.value[0];
  query.value = "";
  contentsExpanded.value = false;
  emit("update:articleId", id);
  void nextTick(() => {
    if (targetSection) focusHeading(sectionId(id, targetSection));
    else focusHeading(id === "overview" ? "manual-overview" : "manual-article-" + id);
  });
}

function openDestination() {
  if (article.value?.destination) emit("navigate", article.value.destination);
}

function imageSource(image: GuideImage) {
  return import.meta.env.BASE_URL + image.src;
}

function openImage(image: GuideImage) {
  enlargedImage.value = image;
  void nextTick(() => imageDialog.value?.showModal());
}

onMounted(() => {
  if (article.value) focusHeading("manual-article-" + article.value.id);
  else window.scrollTo({ top: 0, left: 0 });
});
onBeforeUnmount(() => imageDialog.value?.close());
</script>

<template>
  <section class="manual-page" aria-labelledby="help-title">
    <header class="manual-header">
      <div>
        <p class="manual-product">TaskWeave</p>
        <h1 id="help-title">{{ guide.title }}</h1>
        <p class="manual-introduction">{{ guide.introduction }}</p>
      </div>
      <span class="manual-mode">{{ runningInTauri ? guide.desktopLabel : guide.browserLabel }}</span>
    </header>

    <label class="manual-search">
      <Search :size="18" aria-hidden="true" />
      <span class="sr-only">{{ guide.search }}</span>
      <input v-model="query" type="search" :placeholder="guide.searchPlaceholder" @keydown.esc="query = ''" />
      <button v-if="query" type="button" :title="guide.clear" @click="query = ''">
        <X :size="17" aria-hidden="true" />
      </button>
    </label>

    <div class="manual-layout">
      <aside class="manual-sidebar">
        <button class="manual-mobile-contents" type="button" :aria-expanded="contentsExpanded" aria-controls="manual-navigation" @click="contentsExpanded = !contentsExpanded">
          {{ guide.contents }}<ChevronDown :size="16" aria-hidden="true" />
        </button>
        <div class="manual-navigation-reveal" :class="{ 'is-open': contentsExpanded }">
          <div class="manual-navigation-clip">
        <nav id="manual-navigation" class="manual-navigation" :aria-label="guide.contents">
          <button class="manual-nav-link manual-home-link" type="button" :aria-current="!article && !isSearching ? 'page' : undefined" @click="selectArticle('overview')">
            <BookOpen :size="15" aria-hidden="true" />{{ guide.overview }}
          </button>
          <section v-for="entry in guide.groups" :key="entry.id" class="manual-nav-group">
            <h2>{{ entry.title }}</h2>
            <button
              v-for="item in articlesInGroup(entry.id)"
              :key="item.id"
              class="manual-nav-link"
              type="button"
              :aria-current="article?.id === item.id && !isSearching ? 'page' : undefined"
              @click="selectArticle(item.id)"
            >{{ item.title }}</button>
          </section>
        </nav>
          </div>
        </div>
      </aside>

      <div class="manual-content">
        <section v-if="isSearching" class="manual-results" aria-labelledby="manual-results-title">
          <h2 id="manual-results-title" class="manual-content-title">{{ guide.search }}</h2>
          <p class="manual-result-count" role="status">{{ results.length }} {{ guide.results }}</p>
          <p v-if="!results.length" class="manual-empty">{{ guide.noResults }}</p>
          <button v-for="item in results" :key="item.id" class="manual-search-result" type="button" @click="selectArticle(item.id)">
            <span class="manual-result-group">{{ guide.groups.find((entry) => entry.id === item.group)?.title }}</span>
            <strong>{{ item.title }}</strong><span>{{ item.summary }}</span>
            <ArrowRight :size="17" aria-hidden="true" />
          </button>
        </section>

        <article v-else-if="article" :key="article.id" class="manual-article" :aria-labelledby="'manual-article-' + article.id">
          <div class="manual-breadcrumb">
            <button type="button" @click="selectArticle('overview')"><ArrowLeft :size="14" aria-hidden="true" />{{ guide.overview }}</button>
            <span aria-hidden="true">/</span><span>{{ group?.title }}</span>
          </div>
          <header class="manual-article-header">
            <h2 :id="'manual-article-' + article.id" tabindex="-1">{{ article.title }}</h2>
            <p>{{ article.summary }}</p>
            <div class="manual-entry"><strong>{{ guide.entryLabel }}</strong><span>{{ article.entry }}</span></div>
            <button v-if="article.destination" class="worked-button manual-open-view" type="button" @click="openDestination">
              {{ article.action }}<ArrowRight :size="15" aria-hidden="true" />
            </button>
          </header>

          <nav v-if="article.sections.length > 3" class="manual-page-contents" :aria-label="guide.onThisPage">
            <span>{{ guide.onThisPage }}</span>
            <a v-for="section in article.sections" :key="section.id" :href="'#' + sectionId(article.id, section.id)" @click.prevent="focusHeading(sectionId(article.id, section.id))">{{ section.title }}</a>
          </nav>

          <section v-for="section in articleSections" :key="section.id" class="manual-article-section" :aria-labelledby="sectionId(article.id, section.id)">
            <h3 :id="sectionId(article.id, section.id)" tabindex="-1">{{ section.title }}</h3>
            <ol v-if="section.steps" class="manual-procedure">
              <li v-for="step in section.steps" :key="step.action">
                <p>{{ step.action }}</p>
                <p v-if="step.result" class="manual-expected">{{ step.result }}</p>
              </li>
            </ol>
            <p v-for="paragraph in section.body" :key="paragraph">{{ paragraph }}</p>
            <div v-if="section.table" class="manual-table-scroll" tabindex="0" :aria-label="section.title">
              <table>
                <caption class="sr-only">{{ section.title }}</caption>
                <thead><tr><th v-for="header in section.table.headers" :key="header" scope="col">{{ header }}</th></tr></thead>
                <tbody><tr v-for="row in section.table.rows" :key="row[0]"><th scope="row">{{ row[0] }}</th><td v-for="(cell, index) in row.slice(1)" :key="index">{{ cell }}</td></tr></tbody>
              </table>
            </div>
            <aside v-if="section.note" class="manual-note"><strong>{{ guide.note }}</strong><p>{{ section.note }}</p></aside>
            <details v-if="section.details" class="manual-extra" :open="expandedDetails.includes(section.id)" @toggle="setDetailsOpen(section.id, $event)">
              <summary>{{ section.details.title }}</summary>
              <ol v-if="section.details.steps" class="manual-procedure">
                <li v-for="step in section.details.steps" :key="step.action">
                  <p>{{ step.action }}</p><p v-if="step.result" class="manual-expected">{{ step.result }}</p>
                </li>
              </ol>
              <p v-for="paragraph in section.details.body" :key="paragraph">{{ paragraph }}</p>
              <div v-if="section.details.table" class="manual-table-scroll" tabindex="0" :aria-label="section.details.title">
                <table>
                  <caption class="sr-only">{{ section.details.title }}</caption>
                  <thead><tr><th v-for="header in section.details.table.headers" :key="header" scope="col">{{ header }}</th></tr></thead>
                  <tbody><tr v-for="row in section.details.table.rows" :key="row[0]"><th scope="row">{{ row[0] }}</th><td v-for="(cell, cellIndex) in row.slice(1)" :key="cellIndex">{{ cell }}</td></tr></tbody>
                </table>
              </div>
              <aside v-if="section.details.note" class="manual-note"><strong>{{ guide.note }}</strong><p>{{ section.details.note }}</p></aside>
            </details>
            <details v-if="section.image" class="manual-screenshot">
              <summary>{{ language === 'zh' ? '查看界面截图' : 'View screenshot' }}</summary>
              <figure class="manual-figure">
                <button class="manual-figure-button" type="button" :aria-label="guide.zoom" @click="openImage(section.image)">
                  <img :src="imageSource(section.image)" :alt="section.image.alt" loading="lazy" />
                  <span><Maximize2 :size="14" aria-hidden="true" />{{ guide.imageHint }}</span>
                </button>
                <figcaption>{{ section.image.caption }}</figcaption>
                <dl v-if="section.image.legend.length" class="manual-legend">
                  <template v-for="item in section.image.legend" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.text }}</dd></template>
                </dl>
              </figure>
            </details>
          </section>

          <button v-if="nextArticle" type="button" class="manual-next" @click="selectArticle(nextArticle.id)">
            <span>{{ guide.next }}</span><strong>{{ nextArticle.title }}</strong><ArrowRight :size="18" aria-hidden="true" />
          </button>
          <footer v-if="relatedArticles.length" class="manual-related">
            <h3>{{ guide.related }}</h3>
            <button v-for="item in relatedArticles" :key="item.id" type="button" @click="selectArticle(item.id)">{{ item.title }}<ArrowRight :size="14" aria-hidden="true" /></button>
          </footer>
        </article>

        <div v-else class="manual-overview">
          <section class="manual-start" aria-labelledby="manual-overview">
            <h2 id="manual-overview" tabindex="-1">{{ guide.startTitle }}</h2>
            <p>{{ guide.startDescription }}</p>
            <ol class="manual-start-links">
              <li v-for="(item, index) in articlesInGroup('start')" :key="item.id">
                <button type="button" @click="selectArticle(item.id)">
                  <span class="manual-step-number" aria-hidden="true">{{ index + 1 }}</span>
                  <strong>{{ item.title }}</strong><span class="manual-step-summary">{{ item.summary }}</span><ArrowRight :size="18" aria-hidden="true" />
                </button>
              </li>
            </ol>
          </section>

          <section class="manual-reference" aria-labelledby="manual-reference-title">
            <h2 id="manual-reference-title">{{ guide.referenceTitle }}</h2>
            <section v-for="entry in guide.groups.filter((item) => item.id !== 'start')" :key="entry.id" class="manual-reference-group">
              <h3>{{ entry.title }}</h3>
              <div class="manual-reference-links">
                <button v-for="item in articlesInGroup(entry.id)" :key="item.id" type="button" @click="selectArticle(item.id)">{{ item.title }}<ArrowRight :size="14" aria-hidden="true" /></button>
              </div>
            </section>
          </section>

          <section class="manual-questions" aria-labelledby="manual-questions-title">
            <h2 id="manual-questions-title">{{ guide.faqTitle }}</h2>
            <button v-for="question in guide.questions" :key="question.question" type="button" @click="selectArticle(question.articleId, question.sectionId)">{{ question.question }}<ArrowRight :size="16" aria-hidden="true" /></button>
          </section>
          <aside class="manual-storage">
            <strong>{{ guide.modeLabel }}</strong><p>{{ guide.modeNote }}</p><p v-if="guide.screenshotNote">{{ guide.screenshotNote }}</p>
          </aside>
        </div>
      </div>
    </div>

    <dialog ref="imageDialog" class="manual-image-dialog" :aria-label="guide.zoom" @click="($event.target === imageDialog) && imageDialog?.close()" @close="enlargedImage = null">
      <template v-if="enlargedImage">
        <header><strong>{{ enlargedImage.alt }}</strong><button class="icon-button" type="button" :title="guide.closeImage" @click="imageDialog?.close()"><X :size="20" aria-hidden="true" /></button></header>
        <div class="manual-image-scroll"><img :src="imageSource(enlargedImage)" :alt="enlargedImage.alt" /></div>
      </template>
    </dialog>
  </section>
</template>

<style scoped>
.manual-page { width: 100%; max-width: 1180px; margin: 0 auto; color: var(--text); }
.manual-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.manual-product { margin: 0 0 6px; color: var(--muted); font-size: 12px; letter-spacing: .05em; }
.manual-header h1 { margin: 0; color: var(--heading); font-size: 26px; font-weight: 700; }
.manual-introduction { margin: 12px 0 0; color: var(--subtle); font-size: 14px; line-height: 1.8; }
.manual-mode { flex-shrink: 0; border: 1px solid var(--border); border-radius: 4px; margin-top: 8px; padding: 4px 8px; color: var(--subtle); font-size: 12px; }
.manual-search { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; border: 1px solid var(--border-strong); border-radius: 6px; padding: 0 12px; background: var(--panel-bg); color: var(--muted); }
.manual-search:focus-within { outline: 2px solid var(--primary-border); outline-offset: 2px; }
.manual-search input { min-width: 0; width: 100%; border: 0; outline: 0; padding: 12px 0; background: transparent; color: var(--text); font-size: 14px; }
.manual-search input::-webkit-search-cancel-button { display: none; }
.manual-search button { display: grid; flex-shrink: 0; place-items: center; border: 0; padding: 4px; background: transparent; color: var(--subtle); cursor: pointer; }
.manual-layout { display: grid; grid-template-columns: 202px minmax(0, 1fr); gap: 30px; align-items: start; }
.manual-sidebar { position: sticky; top: 58px; max-height: calc(100dvh - 78px); overflow-y: auto; padding-right: 10px; border-right: 1px solid var(--border); scrollbar-width: thin; }
.manual-mobile-contents { display: none; }
.manual-mobile-contents svg { transition: transform var(--motion-normal, 180ms) var(--motion-ease, ease); }
.manual-mobile-contents[aria-expanded="true"] svg { transform: rotate(180deg); }
.manual-navigation-reveal { display: grid; grid-template-rows: 1fr; }
.manual-navigation-clip { min-height: 0; }
.manual-navigation { display: flex; flex-direction: column; gap: 20px; }
.manual-nav-group h2 { margin: 0 0 7px 9px; color: var(--muted); font-size: 12px; font-weight: 650; }
.manual-nav-link { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; border-radius: 4px; padding: 8px 9px; background: transparent; color: var(--subtle); text-align: left; font-size: 13px; line-height: 1.6; cursor: pointer; }
.manual-nav-link:hover, .manual-nav-link[aria-current="page"] { background: var(--primary-soft); color: var(--primary-hover); }
.manual-nav-link[aria-current="page"] { font-weight: 650; }
.manual-content { min-width: 0; }
.manual-article, .manual-overview, .manual-results { animation: manual-content-in var(--motion-normal, 180ms) var(--motion-ease, ease); }
.manual-content h2, .manual-content h3 { color: var(--heading); }
.manual-content h2 { margin: 0 0 12px; font-size: 21px; line-height: 1.5; }
.manual-content h3 { font-size: 16px; line-height: 1.7; }
.manual-content p { color: var(--subtle); font-size: 14px; line-height: 1.9; overflow-wrap: anywhere; }
.manual-content :is(h2, h3)[tabindex] { scroll-margin-top: 65px; }
.manual-content :is(h2, h3)[tabindex]:focus { outline: none; }
.manual-content :is(h2, h3)[tabindex]:focus-visible { outline: 2px solid var(--primary-border); outline-offset: 4px; }
.manual-start { padding-bottom: 26px; border-bottom: 1px solid var(--border); }
.manual-start > p { margin: 0 0 18px; }
.manual-start-links { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin: 0; padding: 0; list-style: none; }
.manual-start-links button { position: relative; display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 4px 12px; width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 14px 36px 14px 14px; background: var(--panel-bg); text-align: left; cursor: pointer; }
.manual-start-links button:hover { border-color: var(--primary-border); background: var(--primary-soft); }
.manual-start-links strong { color: var(--primary-hover); font-size: 14px; line-height: 1.7; }
.manual-start-links .manual-step-summary { grid-column: 2; color: var(--subtle); font-size: 13px; line-height: 1.8; }
.manual-step-number { display: grid; grid-row: span 2; align-self: start; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--primary-soft); color: var(--primary-hover); font-size: 13px; font-weight: 600; }
.manual-start-links svg { position: absolute; right: 12px; top: 20px; color: var(--primary-hover); }
.manual-reference { padding: 26px 0; }
.manual-reference-group { padding: 14px 0 18px; }
.manual-reference-group + .manual-reference-group { border-top: 1px solid var(--border); }
.manual-reference-group h3 { margin: 0 0 5px; }
.manual-reference-group p { margin: 0 0 10px; font-size: 13px; }
.manual-reference-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px 20px; }
.manual-reference-links button, .manual-related button { display: flex; align-items: center; gap: 8px; border: 0; padding: 8px 0; background: transparent; color: var(--primary-hover); text-align: left; font-size: 14px; line-height: 1.7; cursor: pointer; }
.manual-reference-links button:hover, .manual-related button:hover { text-decoration: underline; text-underline-offset: 4px; }
.manual-reference-links svg, .manual-related svg { flex-shrink: 0; }
.manual-questions { border-top: 1px solid var(--border); padding-top: 26px; }
.manual-questions button { display: flex; align-items: center; justify-content: space-between; gap: 14px; width: 100%; border: 0; border-bottom: 1px solid var(--border); padding: 14px 0; background: transparent; color: var(--text); text-align: left; font-size: 14px; line-height: 1.7; cursor: pointer; }
.manual-questions button:hover { color: var(--primary-hover); }
.manual-questions svg { flex-shrink: 0; }
.manual-storage { margin-top: 28px; padding: 15px 18px; border-left: 3px solid var(--border-strong); background: var(--field-bg); }
.manual-storage strong { color: var(--subtle); font-size: 13px; }
.manual-storage p { margin: 6px 0 0; font-size: 12px; }
.manual-breadcrumb { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; color: var(--muted); font-size: 12px; }
.manual-breadcrumb button { display: flex; align-items: center; gap: 5px; border: 0; padding: 0; background: transparent; color: var(--subtle); font-size: 12px; cursor: pointer; }
.manual-breadcrumb button:hover { color: var(--primary-hover); }
.manual-article-header h2 { font-size: 24px; }
.manual-article-header > p { margin: 0 0 16px; }
.manual-entry { display: flex; flex-wrap: wrap; gap: 6px 12px; color: var(--subtle); font-size: 12px; line-height: 1.8; }
.manual-entry strong { font-weight: 650; }
.manual-open-view { margin-top: 14px; }
.manual-page-contents { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 24px 0; padding: 14px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); font-size: 12px; line-height: 1.9; }
.manual-page-contents span { color: var(--muted); }
.manual-page-contents a { color: var(--primary-hover); text-decoration: none; }
.manual-page-contents a:hover { text-decoration: underline; text-underline-offset: 4px; }
.manual-screenshot { margin: 18px 0; }
.manual-screenshot > summary, .manual-extra > summary { width: fit-content; color: var(--primary-hover); font-size: 13px; line-height: 1.8; cursor: pointer; }
.manual-screenshot > summary:focus-visible, .manual-extra > summary:focus-visible { outline: 2px solid var(--primary-border); outline-offset: 4px; }
.manual-extra { margin-top: 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 5px; }
.manual-extra > p { margin: 10px 0 0; font-size: 13px; }
.manual-extra .manual-table-scroll { margin-top: 12px; }
.manual-figure { margin: 12px 0 20px; }
.manual-figure-button { display: block; width: 100%; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; padding: 0; background: var(--field-bg); cursor: zoom-in; }
.manual-figure-button img { display: block; width: 100%; height: auto; }
.manual-figure-button > span { display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 7px 10px; color: var(--subtle); font-size: 11px; line-height: 1.6; }
.manual-figure figcaption { margin-top: 8px; color: var(--muted); font-size: 11px; line-height: 1.8; }
.manual-legend { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 6px 10px; margin: 14px 0 0; }
.manual-legend dt { display: grid; align-self: start; place-items: center; width: 20px; height: 20px; border: 1px solid var(--border-strong); border-radius: 3px; color: var(--subtle); font-size: 11px; font-weight: 700; }
.manual-legend dd { margin: 0; color: var(--subtle); font-size: 12px; line-height: 1.8; }
.manual-article-section { margin-top: 28px; }
.manual-article-section h3 { margin: 0 0 12px; }
.manual-article-section > p { margin: 0 0 14px; }
.manual-procedure { margin: 12px 0; padding-left: 24px; }
.manual-procedure li { padding-left: 7px; margin-bottom: 22px; font-size: 14px; line-height: 1.8; }
.manual-procedure li::marker { color: var(--subtle); font-weight: 650; }
.manual-procedure p { margin: 0 0 7px; color: var(--text); }
.manual-procedure .manual-expected { color: var(--subtle); font-size: 13px; }
.manual-expected strong { font-weight: 650; }
.manual-table-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 4px; }
.manual-table-scroll table { width: 100%; min-width: 400px; border-collapse: collapse; text-align: left; font-size: 13px; line-height: 1.8; }
.manual-table-scroll th, .manual-table-scroll td { border-bottom: 1px solid var(--border); padding: 11px 13px; vertical-align: top; overflow-wrap: anywhere; }
.manual-table-scroll thead th { background: var(--field-bg); color: var(--heading); font-weight: 650; }
.manual-table-scroll tbody th { width: 29%; color: var(--text); font-weight: 500; }
.manual-table-scroll tbody td { color: var(--subtle); }
.manual-table-scroll tbody tr:last-child > * { border-bottom: 0; }
.manual-note { border-left: 3px solid var(--primary-border); margin-top: 16px; padding: 12px 16px; background: var(--primary-soft); }
.manual-note > strong { color: var(--primary-hover); font-size: 12px; }
.manual-note p { margin: 6px 0 0; font-size: 13px; }
.manual-next { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 16px; width: 100%; margin-top: 30px; padding: 16px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel-bg); text-align: left; cursor: pointer; }
.manual-next:hover { background: var(--primary-soft); border-color: var(--primary-border); }
.manual-next span { color: var(--muted); font-size: 12px; }
.manual-next strong { grid-column: 1; color: var(--primary-hover); font-size: 14px; line-height: 1.7; font-weight: 600; }
.manual-next svg { grid-column: 2; grid-row: 1 / span 2; align-self: center; color: var(--primary-hover); }
.manual-related { margin-top: 34px; padding-top: 20px; border-top: 1px solid var(--border); }
.manual-related h3 { margin: 0 0 8px; }
.manual-related button { display: inline-flex; margin-right: 22px; }
.manual-results h2 { margin: 0; }
.manual-result-count { margin: 8px 0 18px; }
.manual-empty { padding: 16px 0; }
.manual-search-result { position: relative; display: flex; flex-direction: column; gap: 7px; width: 100%; border: 0; border-bottom: 1px solid var(--border); padding: 18px 28px 18px 0; background: transparent; text-align: left; cursor: pointer; }
.manual-search-result:hover { background: var(--primary-soft); }
.manual-result-group { color: var(--muted); font-size: 11px; }
.manual-search-result strong { color: var(--primary-hover); font-size: 16px; line-height: 1.7; }
.manual-search-result > span:not(.manual-result-group) { color: var(--subtle); font-size: 13px; line-height: 1.8; }
.manual-search-result > svg { position: absolute; top: 45%; right: 4px; color: var(--primary-hover); }
.manual-image-dialog { width: min(1500px, calc(100vw - 36px)); max-width: none; max-height: calc(100dvh - 36px); border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: var(--panel-bg); color: var(--text); }
.manual-image-dialog::backdrop { background: rgb(0 0 0 / 65%); }
.manual-image-dialog[open] { animation: manual-dialog-in var(--motion-normal, 180ms) var(--motion-ease, ease); }
.manual-image-dialog[open]::backdrop { animation: manual-content-in var(--motion-normal, 180ms) ease; }
.manual-image-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.manual-image-dialog header strong { font-size: 13px; font-weight: 500; line-height: 1.7; }
.manual-image-dialog header button { flex-shrink: 0; }
.manual-image-scroll { max-height: calc(100dvh - 140px); overflow: auto; }
.manual-image-scroll img { display: block; width: auto; max-width: 100%; height: auto; margin: auto; }
@keyframes manual-content-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes manual-dialog-in {
  from { opacity: 0; transform: translateY(6px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (max-width: 1000px) {
  .manual-layout { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  .manual-sidebar { position: static; max-height: none; overflow: visible; border: 1px solid var(--border); border-radius: 5px; padding: 0; background: var(--panel-bg); }
  .manual-mobile-contents { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; border: 0; padding: 12px 14px; background: transparent; color: var(--text); font-size: 14px; cursor: pointer; }
  .manual-navigation-reveal { grid-template-rows: 0fr; visibility: hidden; transition: grid-template-rows var(--motion-normal, 180ms) var(--motion-ease, ease), visibility 0s var(--motion-normal, 180ms); }
  .manual-navigation-reveal.is-open { grid-template-rows: 1fr; visibility: visible; transition-delay: 0s; }
  .manual-navigation-clip { overflow: hidden; }
  .manual-navigation { padding: 0 14px 14px; }
}
@media (max-width: 560px) {
  .manual-header { gap: 10px; }
  .manual-header h1 { font-size: 23px; }
  .manual-mode { font-size: 11px; }
  .manual-start-links, .manual-reference-links { grid-template-columns: minmax(0, 1fr); }
  .manual-article-header h2 { font-size: 22px; }
  .manual-breadcrumb { flex-wrap: wrap; }
  .manual-image-dialog { padding: 12px; }
  .manual-image-scroll img { max-width: none; min-width: 680px; }
}
@media (prefers-reduced-motion: reduce) {
  .manual-navigation-reveal, .manual-mobile-contents svg { transition: none; }
  .manual-article, .manual-overview, .manual-results,
  .manual-image-dialog[open], .manual-image-dialog[open]::backdrop { animation: none; }
}
</style>
