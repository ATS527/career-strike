import { createRootRoute, createRoute, createRouter, notFound } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Shell } from './Shell';
import { Activity } from './pages/Activity';
import { AddJob } from './pages/AddJob';
import { ApplicationPage } from './pages/ApplicationPage';
import { Applications } from './pages/Applications';
import { Compare } from './pages/Compare';
import { Home } from './pages/Home';
import { Insights } from './pages/Insights';
import { JobPage } from './pages/JobPage';
import { NotFound } from './pages/NotFound';
import { Opportunities } from './pages/Opportunities';
import { Prep } from './pages/Prep';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Sources } from './pages/Sources';

// The dashboard route tree. Record ids are opaque slugs; anything else is "not found" rather
// than a request to the API.
const ID = /^[A-Za-z0-9_-]+$/;
const requireId = ({ params }: { params: { id: string } }): void => {
  if (!ID.test(params.id)) throw notFound();
};

const rootRoute = createRootRoute({ component: Shell, notFoundComponent: NotFound });

const page = (path: string, component: () => ReactNode) => createRoute({ getParentRoute: () => rootRoute, path, component });

const jobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/$id',
  beforeLoad: requireId,
  component: function JobRoute() {
    const { id } = jobRoute.useParams();
    return <JobPage key={id} id={id} />;
  },
});

const applicationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/applications/$id',
  beforeLoad: requireId,
  component: function ApplicationRoute() {
    const { id } = applicationRoute.useParams();
    return <ApplicationPage key={id} id={id} />;
  },
});

const prepRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/applications/$id/prep',
  beforeLoad: requireId,
  component: function PrepRoute() {
    const { id } = prepRoute.useParams();
    return <Prep key={id} applicationId={id} />;
  },
});

const routeTree = rootRoute.addChildren([
  page('/', Home),
  page('/settings', Settings),
  page('/profile', Profile),
  page('/activity', Activity),
  page('/insights', Insights),
  page('/opportunities', Opportunities),
  page('/opportunities/sources', Sources),
  page('/opportunities/new', AddJob),
  page('/opportunities/compare', Compare),
  page('/applications', Applications),
  applicationRoute,
  prepRoute,
  jobRoute,
]);

// Search params stay plain strings exactly as written in the URL (the default parser would turn
// "?min=80" into a number and re-encode values), so links and bookmarks are unchanged.
export const router = createRouter({
  routeTree,
  parseSearch: (search) => Object.fromEntries(new URLSearchParams(search)),
  stringifySearch: (search) => {
    const s = new URLSearchParams(search as Record<string, string>).toString();
    return s ? `?${s}` : '';
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
