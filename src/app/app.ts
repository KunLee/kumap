import { afterNextRender, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Feature } from 'geojson';
import { appConfig as mapDefaults } from './config';
import { LandgateApi } from './landgate';
import { MapService } from './map';
import type {
  HealthResponse,
  PropertyResult,
  SearchCriteria,
  SelectResponse,
  StatusMessage
} from './models';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  private readonly api = inject(LandgateApi);
  private readonly map = inject(MapService);
  private readonly mapHost = viewChild<ElementRef<HTMLElement>>('mapHost');
  private viewportTimer?: number;
  private mapInitialised = false;

  constructor() {
    afterNextRender(() => {
      const host = this.mapHost()?.nativeElement;
      if (host && !this.mapInitialised) {
        this.mapInitialised = true;
        this.onMapReady(host);
        window.setTimeout(() => this.map.resize(), 0);
      }
    });
  }

  readonly title = mapDefaults.title;
  readonly minParcelZoom = mapDefaults.map.minParcelZoom;
  readonly form: SearchCriteria = {
    jobNumber: '',
    lotNumber: '',
    planNumber: '',
    street: '',
    estate: '',
    suburb: '',
    postcode: ''
  };

  readonly busy = signal(false);
  readonly status = signal<StatusMessage | null>(null);
  readonly layerStatus = signal<StatusMessage>({
    kind: 'info',
    text: 'Checking Landgate service…'
  });
  readonly scaleHint = signal(true);
  readonly toast = signal('');
  readonly prontoMessage = signal('');
  readonly health = signal<HealthResponse | null>(null);
  readonly result = signal<PropertyResult | null>(null);
  readonly candidates = signal<Feature[]>([]);
  readonly plans = signal<Feature[]>([]);
  readonly viewportWarning = signal('');

  ngOnDestroy(): void {
    window.clearTimeout(this.viewportTimer);
    this.map.destroy();
  }

  onMapReady(container: HTMLElement): void {
    this.map.init(container, {
      onClickParcel: (lng, lat) => void this.identify(lng, lat),
      onMoveEnd: (bounds) => this.scheduleViewport(bounds)
    });
    void this.checkHealth();
  }

  async findProperty(): Promise<void> {
    this.busy.set(true);
    this.status.set(null);
    this.candidates.set([]);
    this.plans.set([]);
    this.map.clearSelection();
    try {
      const response = await this.api.search(this.form);
      await this.presentSearch(response);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async chooseCandidate(feature: Feature): Promise<void> {
    await this.selectParcel(feature);
  }

  async choosePlan(plan: Feature): Promise<void> {
    this.busy.set(true);
    try {
      if (plan.geometry) {
        this.map.fitFeatures([plan]);
      }
      const response = await this.api.search(this.form, plan.geometry);
      await this.presentSearch(response);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.busy.set(false);
    }
  }

  fillExampleA(): void {
    this.form.lotNumber = '275';
    this.form.suburb = 'North Fremantle';
    this.form.street = 'Irene';
    this.form.planNumber = '';
    this.status.set(null);
  }

  fillExampleB(): void {
    this.form.lotNumber = '275';
    this.form.suburb = 'Eglinton';
    this.form.street = '';
    this.form.planNumber = '12345';
    this.status.set(null);
  }

  async copyCoordinates(): Promise<void> {
    const text = this.result()?.copyText;
    if (!text) {
      this.showToast('Select a parcel first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(`Copied ${text}`);
    } catch {
      this.showToast('Could not copy.');
    }
  }

  useForPronto(): void {
    const current = this.result();
    if (!current) {
      this.prontoMessage.set('Select a parcel first.');
    } else {
      this.prontoMessage.set(`${current.copyText}\nNothing was sent to Pronto.`);
    }
    (document.getElementById('pronto-dialog') as HTMLDialogElement | null)?.showModal();
  }

  streetLabel(feature: Feature): string {
    return formatStreet(feature.properties) || '—';
  }

  lotLabel(feature: Feature): string {
    const lot = feature.properties?.['lot_number'];
    return lot ? `Lot ${String(lot)}` : 'Parcel';
  }

  planLabel(feature: Feature): string {
    const props = feature.properties ?? {};
    return String(props['label_text'] || props['plan_identifier'] || 'Plan extent');
  }

  planMeta(feature: Feature): string {
    const props = feature.properties ?? {};
    return [props['plan_identifier'], props['status'], props['source']].filter(Boolean).join(' · ');
  }

  rawEntries(result: PropertyResult): Array<[string, string]> {
    return Object.entries(result.rawAttributes)
      .filter(([key]) => key !== 'shape')
      .map(([key, value]) => [key, value == null || value === '' ? 'null' : String(value)]);
  }

  private async checkHealth(): Promise<void> {
    try {
      const health = await this.api.health();
      this.health.set(health);
      this.layerStatus.set({
        kind: 'ok',
        text: `${health.datasetId} live`
      });
    } catch (error) {
      const message = messageOf(error);
      this.layerStatus.set({ kind: 'error', text: message });
      this.setStatus('error', message);
    }
  }

  private scheduleViewport(bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
    zoom: number;
  }): void {
    this.scaleHint.set(bounds.zoom < this.minParcelZoom);
    window.clearTimeout(this.viewportTimer);
    if (bounds.zoom < this.minParcelZoom) {
      this.map.setParcels({ type: 'FeatureCollection', features: [] });
      return;
    }
    this.viewportTimer = window.setTimeout(() => void this.loadViewport(bounds), 450);
  }

  private async loadViewport(bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
    zoom: number;
  }): Promise<void> {
    try {
      const response = await this.api.viewport(bounds.west, bounds.south, bounds.east, bounds.north);
      this.map.setParcels(response.collection);
      this.viewportWarning.set(response.warnings.join(' '));
    } catch (error) {
      this.viewportWarning.set(messageOf(error));
    }
  }

  private async identify(lng: number, lat: number): Promise<void> {
    this.status.set(null);
    try {
      const response = await this.api.identify(lng, lat);
      if (response.status === 'multiple') {
        this.candidates.set(response.features);
        this.result.set(null);
        this.map.fitFeatures(response.features);
        this.setStatus('warn', response.warnings.join(' '));
        this.map.showPopup(lng, lat, 'Multiple parcels', 'Pick the correct parcel in the list.');
        return;
      }
      await this.selectParcel(response.features[0]);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async presentSearch(response: {
    status: string;
    warnings: string[];
    features: Feature[];
    plans?: Feature[];
    extent?: [number, number, number, number] | null;
  }): Promise<void> {
    if (response.status === 'plan_candidates') {
      this.plans.set(response.plans ?? []);
      this.candidates.set([]);
      this.result.set(null);
      this.setStatus('warn', response.warnings.join(' '));
      if (response.plans?.[0]) {
        this.map.fitFeatures(response.plans);
      }
      return;
    }
    if (response.status === 'too_many_locality') {
      this.plans.set([]);
      this.candidates.set([]);
      this.result.set(null);
      this.setStatus('warn', response.warnings.join(' '));
      if (response.extent) {
        this.map.fitExtent(response.extent);
      }
      return;
    }

    this.plans.set([]);
    if (response.status === 'single') {
      this.candidates.set([]);
      this.status.set(null);
      await this.selectParcel(response.features[0]);
      return;
    }

    this.candidates.set(response.features);
    this.result.set(null);
    this.setStatus('warn', response.warnings.join(' '));
    this.map.setParcels({ type: 'FeatureCollection', features: response.features });
    this.map.fitFeatures(response.features);
  }

  private async selectParcel(feature: Feature): Promise<void> {
    try {
      const selected = await this.api.select(feature);
      this.candidates.set([]);
      this.plans.set([]);
      this.map.highlight(selected.feature);
      this.map.showPoint(selected.location.lng, selected.location.lat);
      this.map.fitFeatures([selected.feature]);
      const result = toPropertyResult(this.form.jobNumber, selected);
      this.result.set(result);
      const lotValue = str(selected.feature.properties?.['lot_number']);
      this.map.showPopup(
        selected.location.lng,
        selected.location.lat,
        lotValue ? `Lot ${lotValue}` : 'Landgate parcel',
        [result.street, result.suburb].filter((value) => value !== '—').join(', ')
      );
      this.status.set(null);
    } catch (error) {
      this.handleError(error);
    }
  }

  private setStatus(kind: StatusMessage['kind'], text: string): void {
    this.status.set({ kind, text });
  }

  private handleError(error: unknown): void {
    const text = messageOf(error);
    this.setStatus(/not found|no landgate parcel|no parcels matched/i.test(text) ? 'warn' : 'error', text);
  }

  private showToast(text: string): void {
    this.toast.set(text);
    window.setTimeout(() => {
      if (this.toast() === text) {
        this.toast.set('');
      }
    }, 3200);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong talking to Landgate.';
}

function formatStreet(properties: Record<string, unknown> | null | undefined): string | null {
  const attrs = properties ?? {};
  const bits = [
    str(attrs['road_number_1']),
    str(attrs['road_number_2']) ? `– ${str(attrs['road_number_2'])}` : '',
    str(attrs['road_name']),
    str(attrs['road_type']),
    str(attrs['road_suffix'])
  ].filter(Boolean);
  return bits.join(' ') || null;
}

function str(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function display(value: unknown, empty = '—'): string {
  const text = str(value);
  return text || empty;
}

function toPropertyResult(jobNumber: string, selected: SelectResponse): PropertyResult {
  const props = (selected.feature.properties ?? {}) as Record<string, unknown>;
  const plans = selected.intersectingPlans;
  const planLabels = plans.map((plan) =>
    [plan.label_text || plan.plan_identifier, plan.status].filter(Boolean).join(' ')
  );
  let plan = '—';
  if (planLabels.length === 1) {
    plan = planLabels[0];
  } else if (planLabels.length > 1) {
    plan = planLabels.join('; ');
  }

  return {
    job: str(jobNumber) || '—',
    lot: display(props['lot_number']),
    plan,
    parcelId:
      props['land_id'] != null ? String(props['land_id']) : `objectid ${String(props['objectid'] ?? '—')}`,
    suburb: display(props['locality']),
    street: formatStreet(props) || '—',
    area: selected.location.areaLabel || '—',
    latitude: selected.location.latitude,
    longitude: selected.location.longitude,
    coordinateType: selected.location.methodLabel,
    crs: selected.location.crs,
    source: 'Landgate Cadastre Address (LGATE-002) via SLIP public REST',
    locationSource: selected.locationSource,
    dataset: selected.dataset,
    coordinateMethod: selected.location.method,
    timestamp: selected.timestamp,
    warnings: selected.warnings,
    rawAttributes: props,
    copyText: selected.location.copyText
  };
}
