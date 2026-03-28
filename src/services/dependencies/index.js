import { config } from '../../config.js'
import * as depCache from '../dep-cache.js'
import { fetchAllPages, fetchFile } from '../github.js'
import * as npmAdapter from './adapters/npm.js'
import * as pypiAdapter from './adapters/pypi.js'

const ADAPTERS = { npm: npmAdapter, pypi: pypiAdapter }

const EMPTY_DEP_DATA = { fetchedAt: null, rows: [], trackedDependencies: [], driftCount: 0 }

let depStore = null

// Read-only cache access — never triggers API calls.
// Returns EMPTY_DEP_DATA if the cache has not been warmed yet.
export function getDependencies() {
  return depStore ?? EMPTY_DEP_DATA
}

async function getLatestVersion(ecosystem, packageName) {
  const cacheKey = `dep:latest:${ecosystem}:${packageName}`
  if (!depCache.isExpired(cacheKey, config.cacheTtlMs)) {
    return depCache.get(cacheKey)
  }
  const adapter = ADAPTERS[ecosystem]
  if (!adapter) return null
  try {
    const version = await adapter.fetchLatestVersion(packageName)
    depCache.set(cacheKey, version)
    return version
  } catch (err) {
    console.warn(`Failed to fetch latest version for ${ecosystem}:${packageName}: ${err.message}`)
    depCache.set(cacheKey, null)
    return null
  }
}

async function getManifestContent(org, repoName, manifestFile) {
  const cacheKey = `dep:manifest:${org}/${repoName}/${manifestFile}`
  if (!depCache.isExpired(cacheKey, config.cacheTtlMs)) {
    return depCache.get(cacheKey)
  }
  const content = await fetchFile(
    `/repos/${org}/${repoName}/contents/${manifestFile}`,
    config.githubToken
  ).catch((err) => {
    console.warn(`Failed to fetch manifest ${manifestFile} for ${repoName}: ${err.message}`)
    return null
  })
  depCache.set(cacheKey, content)
  return content
}

// Fetches from GitHub/registries and populates the cache. Called only by the scheduler.
export async function warmDependencyCache() {
  const { org, team, githubToken, trackedDependencies } = config

  if (!trackedDependencies.length) {
    depStore = { rows: [], trackedDependencies: [], driftCount: 0, fetchedAt: new Date() }
    return depStore
  }

  const allRepos = await fetchAllPages(`/orgs/${org}/teams/${team}/repos?per_page=100`, githubToken)
  const repos = allRepos.filter((repo) => repo.permissions?.[config.requiredTeamRole])

  const latestMap = {}
  await Promise.all(
    trackedDependencies.map(async ({ ecosystem, packageName }) => {
      latestMap[`${ecosystem}:${packageName}`] = await getLatestVersion(ecosystem, packageName)
    })
  )

  const depsByEcosystem = {}
  for (const { ecosystem, packageName } of trackedDependencies) {
    if (!depsByEcosystem[ecosystem]) depsByEcosystem[ecosystem] = []
    depsByEcosystem[ecosystem].push(packageName)
  }

  const rows = await Promise.all(
    repos.map(async (repo) => {
      const deps = {}
      for (const [ecosystem, packageNames] of Object.entries(depsByEcosystem)) {
        const adapter = ADAPTERS[ecosystem]
        if (!adapter) continue
        const content = await getManifestContent(org, repo.name, adapter.manifestFile)
        for (const packageName of packageNames) {
          const key = `${ecosystem}:${packageName}`
          const pinned = content ? adapter.extractVersion(content, packageName) : null
          const latest = latestMap[key]
          deps[key] = {
            pinned,
            latest,
            isDrift: pinned !== null && latest !== null && pinned !== latest,
          }
        }
      }
      return { repo: repo.name, deps }
    })
  )

  const filteredRows = rows.filter((row) =>
    Object.values(row.deps).some((d) => d.pinned !== null)
  )

  const driftCount = filteredRows.filter((row) =>
    Object.values(row.deps).some((d) => d.isDrift)
  ).length

  depStore = { rows: filteredRows, trackedDependencies, driftCount, fetchedAt: new Date() }
  return depStore
}
