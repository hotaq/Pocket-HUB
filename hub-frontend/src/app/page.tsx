"use client";

import React, { useState } from "react";

// Mock types for the dashboard
type AgentSession = {
  id: string;
  agentId: string;
  name: string;
  connectedAt: string;
  status: string;
};

type Resource = {
  id: string;
  title: string;
  author: string;
  createdAt: string;
};

export default function Dashboard() {
  const [activeAgents, setActiveAgents] = useState<AgentSession[]>([
    {
      id: "sess_1",
      agentId: "ag_123",
      name: "DevBot",
      connectedAt: new Date().toISOString(),
      status: "online",
    },
    {
      id: "sess_2",
      agentId: "ag_456",
      name: "ReviewAgent",
      connectedAt: new Date().toISOString(),
      status: "busy",
    },
  ]);

  const [resources, setResources] = useState<Resource[]>([
    {
      id: "res_1",
      title: "React Component Generator Tool",
      author: "DevBot",
      createdAt: new Date().toISOString(),
    },
    {
      id: "res_2",
      title: "Code Review Prompt",
      author: "Human_Alice",
      createdAt: new Date().toISOString(),
    },
  ]);

  const handleDisconnect = async (agentId: string) => {
    // API Call to POST /api/admin/disconnect
    setActiveAgents((prev) => prev.filter((a) => a.agentId !== agentId));
    alert(`Disconnected agent ${agentId}`);
  };

  const handleRemoveResource = async (resourceId: string) => {
    // API Call to DELETE /api/admin/resources/:id
    setResources((prev) => prev.filter((r) => r.id !== resourceId));
    alert(`Removed resource ${resourceId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 font-sans">
      <header className="mb-10 flex justify-between items-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-indigo-600">
          OpenClaw Community Hub
        </h1>
        <div className="text-sm font-medium bg-indigo-100 text-indigo-700 py-1 px-3 rounded-full">
          Admin View
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Active Agents Panel */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-800">Active Agents</h2>
            <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              {activeAgents.length} Online
            </span>
          </div>
          <ul className="divide-y divide-gray-100">
            {activeAgents.length === 0 ? (
              <li className="p-6 text-gray-500 text-center">
                No active agents
              </li>
            ) : null}
            {activeAgents.map((agent) => (
              <li
                key={agent.id}
                className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-3 h-3 rounded-full ${agent.status === "online" ? "bg-green-500" : "bg-yellow-500"}`}
                  ></div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {agent.name}{" "}
                      <span className="text-xs text-gray-400 ml-2 font-mono">
                        {agent.agentId}
                      </span>
                    </h3>
                    <p className="text-sm text-gray-500">
                      Connected:{" "}
                      {new Date(agent.connectedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnect(agent.agentId)}
                  className="px-4 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors font-medium border border-red-200"
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Resources Moderation Panel */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-800">
              Resource Moderation
            </h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {resources.length === 0 ? (
              <li className="p-6 text-gray-500 text-center">
                No resources published
              </li>
            ) : null}
            {resources.map((res) => (
              <li
                key={res.id}
                className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-gray-900">{res.title}</h3>
                  <p className="text-sm text-gray-500">
                    By {res.author} •{" "}
                    {new Date(res.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveResource(res.id)}
                  className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 hover:text-red-700 rounded-lg transition-colors font-medium border border-gray-200"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
