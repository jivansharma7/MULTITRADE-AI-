import React, { useMemo, useState } from 'react';
import { Cpu, Layers, Search } from 'lucide-react';
import { AGENT_DEPARTMENTS, AGENT_REGISTRY, getRegistryStats } from '../shared/agentRegistry';
import type { AgentRoleDefinition } from '../shared/types';
import { useAuth } from '../contexts/AuthContext';

export const AgentCenterView: React.FC = () => {
  const { recentReports } = useAuth();
  const stats = getRegistryStats();
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPERATIONAL' | 'REGISTERED'>('ALL');
  const [search, setSearch] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentRoleDefinition | null>(AGENT_REGISTRY[0]);

  const filteredAgents = useMemo(() => {
    return AGENT_REGISTRY.filter((a) => {
      if (selectedDept !== 'ALL' && a.department !== selectedDept) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          a.name.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.specialty.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [selectedDept, statusFilter, search]);

  const latestExecForSelected = useMemo(() => {
    if (!selectedAgent) return null;
    for (const rep of recentReports) {
      const hit = rep.agentResults.find((r) => r.agentId === selectedAgent.id);
      if (hit) return { report: rep, result: hit };
    }
    return null;
  }, [selectedAgent, recentReports]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">
            130-Role AI Agent Intelligence Center
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Scalable 12-department registry: {stats.operational} operational deterministic &amp; Gemini workers active; {stats.registered} additional specialist roles registered for staged rollout.
          </p>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
          <span className="text-emerald-400">{stats.operational} OPERATIONAL</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-300">{stats.registered} REGISTERED</span>
          <span className="text-slate-600">·</span>
          <span className="text-blue-400">{stats.total} TOTAL ROLES</span>
        </div>
      </div>

      {/* 6-Stage Architecture Flow */}
      <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Layers className="h-3.5 w-3.5 text-blue-400" />
          Execution Pipeline Topology
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['1. Data Layer', 'DexScreener, RPC, GeckoTerminal'],
            ['2. Parallel Workers', '17 Deterministic TypeScript Workers'],
            ['3. Dept Consensus', '12 Specialized Domain Groups'],
            ['4. Chief Orchestrator', 'Gemini 4 Hydrogen Synthesis'],
            ['5. Evidence Gate', 'Critical Risk Flag Override'],
            ['6. Human Workflow', 'Research Report -> Paper / Sign'],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
              <div className="font-semibold text-white">{title}</div>
              <div className="mt-0.5 text-slate-400">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Department Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {AGENT_DEPARTMENTS.map((dept) => {
          const op = dept.roles.filter((r) => r.operational).length;
          const active = selectedDept === dept.name;
          return (
            <button
              key={dept.code}
              type="button"
              onClick={() => setSelectedDept(active ? 'ALL' : dept.name)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                active
                  ? 'border-blue-500 bg-blue-600/15'
                  : 'border-slate-800 bg-[#0D1322] hover:border-slate-700'
              }`}
            >
              <div className="text-[11px] font-mono text-slate-400">
                DEPT {String(dept.code).padStart(2, '0')}
              </div>
              <div className="mt-0.5 truncate text-xs font-semibold text-white">{dept.name}</div>
              <div className="mt-2 font-mono text-[11px] text-slate-400 tabular-nums">
                <span className="text-emerald-400">{op} live</span> / {dept.targetCount} roles
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter & Inspector Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0D1322] p-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                aria-label="Filter agents by name, ID, or capability"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter 130 agent roles..."
                className="w-full rounded-lg border border-slate-700 bg-[#070B14] py-1.5 pl-8 pr-3 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#070B14] p-1 text-xs">
              {(['ALL', 'OPERATIONAL', 'REGISTERED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                    statusFilter === st ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[520px] overflow-y-auto rounded-xl border border-slate-800 bg-[#0D1322]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b border-slate-800 bg-[#0D1322] text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Agent ID</th>
                  <th className="px-4 py-2.5 font-medium">Role Name</th>
                  <th className="px-4 py-2.5 font-medium">Department</th>
                  <th className="px-4 py-2.5 font-medium">Mode</th>
                  <th className="px-4 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filteredAgents.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setSelectedAgent(a)}
                    className={`cursor-pointer transition-colors hover:bg-slate-800/40 ${
                      selectedAgent?.id === a.id ? 'bg-blue-600/10' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">{a.id}</td>
                    <td className="px-4 py-2.5 font-medium text-white">{a.name}</td>
                    <td className="px-4 py-2.5 text-slate-400">{a.department}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400">
                      {a.executionMode}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px]">
                      <span
                        className={
                          a.status === 'OPERATIONAL' ? 'text-emerald-400' : 'text-slate-400'
                        }
                      >
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Agent Inspector Drawer */}
        <div className="rounded-xl border border-slate-800 bg-[#0D1322] p-5 lg:col-span-4">
          {selectedAgent ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-blue-400">{selectedAgent.id}</div>
                  <h2 className="mt-1 text-base font-semibold text-white">{selectedAgent.name}</h2>
                  <div className="mt-0.5 text-xs text-slate-400">{selectedAgent.department}</div>
                </div>
                <Cpu className="h-5 w-5 text-slate-400" />
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3 text-xs">
                <div className="text-slate-400">Responsibility</div>
                <div className="mt-1 leading-relaxed text-slate-200">{selectedAgent.specialty}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
                  <div className="text-[11px] text-slate-400">Status</div>
                  <div
                    className={`mt-1 font-mono font-semibold ${
                      selectedAgent.status === 'OPERATIONAL'
                        ? 'text-emerald-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {selectedAgent.status}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-2.5">
                  <div className="text-[11px] text-slate-400">Execution Mode</div>
                  <div className="mt-1 font-mono text-[11px] text-white">
                    {selectedAgent.executionMode}
                  </div>
                </div>
              </div>

              {latestExecForSelected ? (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs space-y-2">
                  <div className="font-semibold text-blue-300">
                    Latest Execution ({latestExecForSelected.report.symbol})
                  </div>
                  <div className="text-slate-200">{latestExecForSelected.result.analysisResult}</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    Confidence: {latestExecForSelected.result.confidenceScore}% · Duration:{' '}
                    {latestExecForSelected.result.executionDurationMs}ms
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-400">
                    {latestExecForSelected.result.evidence.map((e, i) => (
                      <li key={i}>· {e}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3 text-xs text-slate-400">
                  {selectedAgent.status === 'OPERATIONAL'
                    ? 'Run AI Multi-Agent Analysis on any token to inspect live worker output and execution timing here.'
                    : 'This specialist role is registered in the 130-agent blueprint and not yet wired to a live data worker (honestly marked REGISTERED rather than operational).'}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
