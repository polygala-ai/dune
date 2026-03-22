/**
 * Centralized icon utility using Lucide icons rendered as Lit SVG templates.
 *
 * Usage in components:
 *   import { iconPlus, iconX } from '../utils/icons.js';
 *   html`<button>${iconPlus()}</button>`
 */
import { svg, type SVGTemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';

/* ── Lucide icon data (tree-shakeable imports) ────────────────────────── */
import {
  Plus, Minus, Square, X, PanelLeft, Settings, Box, LayoutGrid,
  Users, Info, Trash2, FileText, Play, Pause, ChevronLeft, ChevronRight,
  ChevronDown, Menu, Link, ArrowRight, Camera, Wrench, XCircle,
  AlertTriangle, RefreshCw, Search, Maximize2, Minimize2, CircleStop, Files,
} from 'lucide';

/* ── Types ────────────────────────────────────────────────────────────── */
type IconNode = [tag: string, attrs: Record<string, string>][];

interface IconOptions {
  size?: number;
  strokeWidth?: number;
}

/* ── Renderer ─────────────────────────────────────────────────────────── */

function attrsToString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

function renderIcon(
  node: IconNode,
  { size = 18, strokeWidth = 1.6 }: IconOptions = {},
): SVGTemplateResult {
  const inner = node
    .map(([tag, attrs]) => `<${tag} ${attrsToString(attrs)}/>`)
    .join('');

  return svg`<svg
    xmlns="http://www.w3.org/2000/svg"
    width="${size}"
    height="${size}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="${strokeWidth}"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >${unsafeSVG(inner)}</svg>`;
}

/* ── Exported icon functions ──────────────────────────────────────────── */

// Navigation & layout
export const iconPanelLeft = (o?: IconOptions) => renderIcon(PanelLeft, o);
export const iconMenu = (o?: IconOptions) => renderIcon(Menu, o);
export const iconSettings = (o?: IconOptions) => renderIcon(Settings, o);
export const iconSearch = (o?: IconOptions) => renderIcon(Search, o);
export const iconChevronLeft = (o?: IconOptions) => renderIcon(ChevronLeft, o);
export const iconChevronRight = (o?: IconOptions) => renderIcon(ChevronRight, o);
export const iconChevronDown = (o?: IconOptions) => renderIcon(ChevronDown, o);

// Actions
export const iconPlus = (o?: IconOptions) => renderIcon(Plus, o);
export const iconMinus = (o?: IconOptions) => renderIcon(Minus, o);
export const iconX = (o?: IconOptions) => renderIcon(X, o);
export const iconTrash = (o?: IconOptions) => renderIcon(Trash2, o);
export const iconRefresh = (o?: IconOptions) => renderIcon(RefreshCw, o);

// Media controls
export const iconPlay = (o?: IconOptions) => renderIcon(Play, o);
export const iconPause = (o?: IconOptions) => renderIcon(Pause, o);
export const iconStop = (o?: IconOptions) => renderIcon(CircleStop, o);

// Window controls
export const iconSquare = (o?: IconOptions) => renderIcon(Square, o);
export const iconMaximize = (o?: IconOptions) => renderIcon(Maximize2, o);
export const iconMinimize = (o?: IconOptions) => renderIcon(Minimize2, o);

// Content & files
export const iconFileText = (o?: IconOptions) => renderIcon(FileText, o);
export const iconFiles = (o?: IconOptions) => renderIcon(Files, o);
export const iconBox = (o?: IconOptions) => renderIcon(Box, o);
export const iconLayoutGrid = (o?: IconOptions) => renderIcon(LayoutGrid, o);
export const iconCamera = (o?: IconOptions) => renderIcon(Camera, o);

// People & communication
export const iconUsers = (o?: IconOptions) => renderIcon(Users, o);
export const iconArrowRight = (o?: IconOptions) => renderIcon(ArrowRight, o);
export const iconLink = (o?: IconOptions) => renderIcon(Link, o);

// Status & info
export const iconInfo = (o?: IconOptions) => renderIcon(Info, o);
export const iconAlertTriangle = (o?: IconOptions) => renderIcon(AlertTriangle, o);
export const iconXCircle = (o?: IconOptions) => renderIcon(XCircle, o);
export const iconWrench = (o?: IconOptions) => renderIcon(Wrench, o);
