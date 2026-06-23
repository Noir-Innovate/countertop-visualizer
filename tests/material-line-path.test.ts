import test from "node:test";
import assert from "node:assert/strict";
import { getPublicVisualizerUrl } from "@/lib/material-line-path";

const APP_DOMAIN = "countertopvisualizer.com";
const APP_BASE = "https://www.countertopvisualizer.com";

test("external line uses its subdomain", () => {
  const url = getPublicVisualizerUrl({
    lineKind: "external",
    slug: "acme",
    customDomain: null,
    customDomainVerified: false,
    appDomain: APP_DOMAIN,
    appBaseUrl: APP_BASE,
  });
  assert.equal(url, "https://acme.countertopvisualizer.com");
});

test("external line prefers a verified custom domain", () => {
  const url = getPublicVisualizerUrl({
    lineKind: "external",
    slug: "acme",
    customDomain: "visualizer.acme.com",
    customDomainVerified: true,
    appDomain: APP_DOMAIN,
    appBaseUrl: APP_BASE,
  });
  assert.equal(url, "https://visualizer.acme.com");
});

test("access-locked internal line uses the path-based sales URL on the main app", () => {
  const url = getPublicVisualizerUrl({
    lineKind: "internal",
    slug: "acme-internal",
    customDomain: null,
    customDomainVerified: false,
    appDomain: APP_DOMAIN,
    accessLocked: true,
    orgSlug: "acme",
    appBaseUrl: APP_BASE,
  });
  assert.equal(url, "https://www.countertopvisualizer.com/acme/acme-internal/sales");
});

test("path-based sales URL strips a trailing slash on the app base", () => {
  const url = getPublicVisualizerUrl({
    lineKind: "internal",
    slug: "acme-internal",
    customDomain: null,
    customDomainVerified: false,
    appDomain: APP_DOMAIN,
    accessLocked: true,
    orgSlug: "acme",
    appBaseUrl: "https://www.countertopvisualizer.com/",
  });
  assert.equal(url, "https://www.countertopvisualizer.com/acme/acme-internal/sales");
});

test("access-locked internal line falls back to subdomain /sales when orgSlug is missing", () => {
  const url = getPublicVisualizerUrl({
    lineKind: "internal",
    slug: "acme-internal",
    customDomain: null,
    customDomainVerified: false,
    appDomain: APP_DOMAIN,
    accessLocked: true,
    appBaseUrl: APP_BASE,
  });
  assert.equal(url, "https://acme-internal.countertopvisualizer.com/sales");
});

test("unlocked internal line keeps the subdomain /internal experience", () => {
  const url = getPublicVisualizerUrl({
    lineKind: "internal",
    slug: "acme-internal",
    customDomain: null,
    customDomainVerified: false,
    appDomain: APP_DOMAIN,
    accessLocked: false,
    orgSlug: "acme",
    appBaseUrl: APP_BASE,
  });
  assert.equal(url, "https://acme-internal.countertopvisualizer.com/internal");
});
