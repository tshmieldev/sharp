import { useEffect, useMemo, useState } from 'preact/hooks';
import { request, type Model, type ModelEndpoint } from '../common/messages';
import * as fmt from './format';
import { Bolt, ChevronLeft, Clock, Close, Pulse, Search, Star } from './icons';
import { Segmented, type SettingsEditor } from './ui';

// Kept for the life of the popup so reopening the browser is instant.
let cache: { provider: string; models: readonly Model[] } | null = null;
// /models carries no speed data, so latency has to be measured per model. Only
// the head of the current filter is measured; searching is how you aim it.
type Measure = { latency?: number; throughput?: number };
const measured = new Map<string, Measure>();
const MEASURE_LIMIT = 25;
const MEASURE_WORKERS = 4;

type Kind = 'all' | 'vision' | 'saved';
type Sort = 'popular' | 'name' | 'price' | 'context' | 'new' | 'latency';
type EndpointSort = 'price' | 'speed' | 'latency' | 'uptime';
type Props = SettingsEditor & { initialView: 'models' | 'providers'; onClose: () => void };

export function ModelBrowser({ settings, update, initialView, onClose }: Props) {
  const [view, setView] = useState(initialView);
  const [models, setModels] = useState<readonly Model[] | null>(
    cache?.provider === settings.provider ? cache.models : null,
  );
  const [modelsError, setModelsError] = useState('');
  const [endpoints, setEndpoints] = useState<readonly ModelEndpoint[] | null>(null);
  const [endpointsError, setEndpointsError] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>(settings.provider === 'openrouter' ? 'popular' : 'name');
  const [endpointSort, setEndpointSort] = useState<EndpointSort>('price');
  const [limit, setLimit] = useState(50);
  const [stats, setStats] = useState<Record<string, Measure>>(() => Object.fromEntries(measured));
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);

  useEffect(() => {
    if (view !== 'models' || models) return;
    let live = true;
    setModelsError('');
    request({ type: 'LIST_MODELS' }).then(
      (result) => {
        if (!live) return;
        cache = { provider: settings.provider, models: result };
        setModels(result);
      },
      (error: unknown) => {
        if (live) setModelsError(error instanceof Error ? error.message : 'Could not load models.');
      },
    );
    return () => {
      live = false;
    };
  }, [view, models, settings.provider]);

  useEffect(() => {
    if (view !== 'providers') return;
    let live = true;
    setEndpoints(null);
    setEndpointsError('');
    request({ type: 'LIST_ENDPOINTS', model: settings.model }).then(
      (result) => live && setEndpoints(result),
      (error: unknown) => {
        if (live)
          setEndpointsError(error instanceof Error ? error.message : 'Could not load providers.');
      },
    );
    return () => {
      live = false;
    };
  }, [view, settings.model]);

  const favorite = (id: string) =>
    settings.favorites.some(
      (entry) => entry.model === id && (entry.provider ?? 'openrouter') === settings.provider,
    );
  const toggleFavorite = (id: string) =>
    update(
      'favorites',
      favorite(id)
        ? settings.favorites.filter(
            (entry) =>
              !(entry.model === id && (entry.provider ?? 'openrouter') === settings.provider),
          )
        : [...settings.favorites, { provider: settings.provider, model: id }],
    );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (models ?? []).filter((model) => {
      if (kind === 'vision' && !model.vision) return false;
      if (kind === 'saved' && !favorite(model.id)) return false;
      return (
        !needle ||
        model.id.toLowerCase().includes(needle) ||
        model.name.toLowerCase().includes(needle)
      );
    });
  }, [models, query, kind, settings.favorites, settings.provider]);

  const measurable = sort === 'latency' && settings.provider === 'openrouter';
  useEffect(() => {
    if (view !== 'models' || !measurable) return;
    const targets = filtered.slice(0, MEASURE_LIMIT).filter((model) => !measured.has(model.id));
    if (!targets.length) return;
    let live = true;
    let next = 0;
    setPending(targets.length);
    const worker = async () => {
      while (live && next < targets.length) {
        const model = targets[next++]!;
        try {
          const endpoints = await request({ type: 'LIST_ENDPOINTS', model: model.id });
          const pick = (values: (number | undefined)[], best: (list: number[]) => number) => {
            const known = values.filter((value): value is number => value !== undefined);
            return known.length ? best(known) : undefined;
          };
          measured.set(model.id, {
            latency: pick(
              endpoints.map((item) => item.latency),
              (list) => Math.min(...list),
            ),
            throughput: pick(
              endpoints.map((item) => item.throughput),
              (list) => Math.max(...list),
            ),
          });
        } catch {
          measured.set(model.id, {});
        }
        if (!live) return;
        setStats(Object.fromEntries(measured));
        setPending((count) => Math.max(0, count - 1));
      }
    };
    void Promise.all(Array.from({ length: MEASURE_WORKERS }, worker));
    return () => {
      live = false;
      setPending(0);
    };
  }, [view, measurable, filtered]);

  const visible = useMemo(() => {
    const cost = (model: Model) => model.promptPrice ?? Number.POSITIVE_INFINITY;
    const lag = (model: Model) => stats[model.id]?.latency ?? Number.POSITIVE_INFINITY;
    const seat = (model: Model) => model.rank ?? Number.POSITIVE_INFINITY;
    return [...filtered].sort((a, b) =>
      sort === 'popular'
        ? seat(a) - seat(b) || a.name.localeCompare(b.name)
        : sort === 'price'
          ? cost(a) - cost(b) || a.name.localeCompare(b.name)
          : sort === 'context'
            ? (b.context ?? 0) - (a.context ?? 0)
            : sort === 'new'
              ? (b.created ?? 0) - (a.created ?? 0)
              : sort === 'latency'
                ? lag(a) - lag(b) || a.name.localeCompare(b.name)
                : a.name.localeCompare(b.name),
    );
  }, [filtered, sort, stats]);

  const rankedEndpoints = useMemo(() => {
    // Unknown figures always sink, whichever direction the column sorts.
    const high = (value: number | undefined) => value ?? -1;
    const low = (value: number | undefined) => value ?? Number.POSITIVE_INFINITY;
    return [...(endpoints ?? [])].sort((a, b) =>
      endpointSort === 'speed'
        ? high(b.throughput) - high(a.throughput)
        : endpointSort === 'latency'
          ? low(a.latency) - low(b.latency)
          : endpointSort === 'uptime'
            ? high(b.uptime) - high(a.uptime)
            : low(a.promptPrice) - low(b.promptPrice),
    );
  }, [endpoints, endpointSort]);

  function chooseModel(id: string) {
    update('model', id);
    if (settings.provider !== 'openrouter') return onClose();
    // A pinned endpoint belongs to the previous model, not this one.
    update('routingProvider', '');
    setView('providers');
  }

  const reset =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setLimit(50);
    };

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Choose a model">
      <div class="sheet-head">
        {view === 'providers' && initialView === 'models' && (
          <button
            type="button"
            class="btn icon"
            aria-label="Back to models"
            onClick={() => setView('models')}
          >
            <ChevronLeft />
          </button>
        )}
        <h2>
          {view === 'models' ? 'Models' : settings.model || 'Providers'}
          <span class="sub">
            {view === 'models'
              ? 'Text in, text out. Vision models can also read images.'
              : 'Pick where OpenRouter sends this model.'}
          </span>
        </h2>
        <button type="button" class="btn icon" aria-label="Close" onClick={onClose}>
          <Close />
        </button>
      </div>

      {view === 'models' ? (
        <>
          <div class="sheet-tools">
            <div class="search">
              <Search />
              <input
                type="search"
                value={query}
                placeholder="Search models"
                spellcheck={false}
                onInput={(event) => reset(setQuery)(event.currentTarget.value)}
              />
            </div>
            <div class="rowline">
              <Segmented
                label="Filter models"
                value={kind}
                onChange={reset(setKind)}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'vision', label: 'Vision' },
                  { value: 'saved', label: 'Saved' },
                ]}
              />
              <select
                aria-label="Sort models"
                style="width:auto"
                value={sort}
                onChange={(event) => reset(setSort)(event.currentTarget.value as Sort)}
              >
                {settings.provider === 'openrouter' && <option value="popular">Popular</option>}
                <option value="name">A–Z</option>
                <option value="price">Cheapest</option>
                <option value="context">Context</option>
                <option value="new">Newest</option>
                {settings.provider === 'openrouter' && (
                  <option value="latency">Lowest latency</option>
                )}
              </select>
            </div>
            {sort === 'popular' &&
              models &&
              filtered.every((model) => model.rank === undefined) && (
                <p class="note">
                  OpenRouter is not publishing its weekly ranking right now. Showing A–Z instead.
                </p>
              )}
            {measurable && (
              <p class="note">
                {pending > 0
                  ? `Measuring latency, ${pending} to go.`
                  : visible.every((model) => stats[model.id]?.latency === undefined)
                    ? 'OpenRouter reports no recent latency for these models.'
                    : filtered.length > MEASURE_LIMIT
                      ? `Measured the first ${MEASURE_LIMIT} of ${filtered.length}. Search to measure the ones you want.`
                      : `Measured all ${filtered.length}.`}
              </p>
            )}
          </div>
          <div class="sheet-list">
            {modelsError && (
              <p class="notice bad" role="alert">
                {modelsError}
              </p>
            )}
            {!models && !modelsError && <Skeletons />}
            {models && !visible.length && !modelsError && (
              <p class="empty">No model matches that search.</p>
            )}
            {visible.slice(0, limit).map((model) => (
              <div key={model.id} class="mrow" data-current={model.id === settings.model}>
                <button
                  type="button"
                  class="star"
                  aria-pressed={favorite(model.id)}
                  aria-label={favorite(model.id) ? 'Remove from saved' : 'Save this model'}
                  onClick={() => toggleFavorite(model.id)}
                >
                  <Star filled={favorite(model.id)} />
                </button>
                <button type="button" class="open" onClick={() => chooseModel(model.id)}>
                  <span style="min-width:0;flex:1">
                    <span class="name">{model.name}</span>
                    <span class="sub">
                      {model.id}
                      {model.context ? ` · ${fmt.context(model.context)} ctx` : ''}
                      {stats[model.id]?.latency !== undefined
                        ? ` · ${fmt.latency(stats[model.id]?.latency)}`
                        : ''}
                    </span>
                  </span>
                  {model.vision && <span class="badge">Vision</span>}
                  <span class="cost">
                    <b>{fmt.price(model.promptPrice)}</b>
                    {fmt.price(model.completionPrice)}
                  </span>
                </button>
              </div>
            ))}
            {visible.length > limit && (
              <button
                type="button"
                class="btn block"
                style="margin-top:8px"
                onClick={() => setLimit(limit + 50)}
              >
                Show {Math.min(50, visible.length - limit)} more of {visible.length}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div class="sheet-tools">
            <Segmented
              label="Sort providers"
              value={endpointSort}
              onChange={setEndpointSort}
              options={[
                { value: 'price', label: 'Price' },
                { value: 'speed', label: 'Speed' },
                { value: 'latency', label: 'Latency' },
                { value: 'uptime', label: 'Uptime' },
              ]}
            />
          </div>
          <div class="sheet-list">
            {endpointsError && (
              <p class="notice bad" role="alert">
                {endpointsError}
              </p>
            )}
            <button
              type="button"
              class="erow"
              data-current={!settings.routingProvider}
              onClick={() => {
                update('routingProvider', '');
                onClose();
              }}
            >
              <span class="top">
                <b>Automatic</b>
                <span class="spacer" />
                <span class="price">by {settings.routingSort}</span>
              </span>
              <span class="metrics">
                <span>OpenRouter picks an endpoint for every request and fails over.</span>
              </span>
            </button>
            {!endpoints && !endpointsError && <Skeletons />}
            {rankedEndpoints.map((item) => (
              <button
                key={item.tag}
                type="button"
                class="erow"
                data-current={settings.routingProvider === item.tag}
                onClick={() => {
                  update('routingProvider', item.tag);
                  onClose();
                }}
              >
                <span class="top">
                  <b>{item.name}</b>
                  {item.quantization && item.quantization !== 'unknown' && (
                    <span class="badge">{item.quantization}</span>
                  )}
                  <span class="spacer" />
                  <span class="price">
                    {fmt.price(item.promptPrice)} / {fmt.price(item.completionPrice)}
                  </span>
                </span>
                <span class="metrics">
                  <span>
                    <Bolt />
                    {fmt.speed(item.throughput)}
                  </span>
                  <span>
                    <Clock />
                    {fmt.latency(item.latency)}
                  </span>
                  <span>
                    <Pulse />
                    {fmt.uptime(item.uptime)} up
                  </span>
                  <span>{fmt.context(item.context)} ctx</span>
                </span>
              </button>
            ))}
            {endpoints?.length && endpoints.every((item) => !item.throughput && !item.latency) ? (
              <p class="note">
                OpenRouter publishes speed and latency only for endpoints it has measured recently.
                Price, uptime and context are current for all of them.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

const Skeletons = () => (
  <>
    {[0, 1, 2, 3, 4, 5].map((row) => (
      <div key={row} class="skeleton" />
    ))}
  </>
);
