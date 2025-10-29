import { Users, Building2, Link as LinkIcon, Mail } from "lucide-react";

export default function About() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">关于我们</h1>
        <p className="text-white/60 text-base">团队介绍与研究方向</p>
      </div>

      <div className="space-y-8">
        {/* Team Members */}
        <section className="card">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-white/10 grid place-items-center shadow-lg">
            <Users size={26} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-white mb-4">项目团队</h2>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              name: "文明",
              role: "指导老师 · 副教授",
              photo: "/images/team/wenming-shenghuozhao.jpg",
              description: "华中科技大学网络空间安全学院副教授、博士生导师，领导ARTS³研究小组，聚焦系统软件安全前沿研究。主要研究方向包括代码大模型安全、软件测试与分析、程序缺陷漏洞的检测、定位与修复等。",
              homepage: "",
              email: "",
            },
            {
              name: "邱士煜",
              role: "队长 · 2025级博士生",
              photo: "/images/team/qiushiyu-shenghuozhao.png",
              description: "华中科技大学网络空间安全学院2025级博士生，主要研究方向为编译器测试、JVM测试、JIT编译器测试。InterFuzz工具项目负责人，致力于提升Java编译器的可靠性与安全性。",
              homepage: "",
              email: "",
            },
            {
              name: "赖昕",
              role: "队员 · 2025级硕士生",
              photo: "/images/team/laixin-shenghuozhao.png",
              description: "华中科技大学网络空间安全学院2025级硕士生，主要研究方向为编译器测试与程序分析，参与InterFuzz工具的开发与优化，致力于提升编译器的测试覆盖率和缺陷检测能力。",
              homepage: "",
              email: "",
            },
            {
              name: "吴若仪",
              role: "队员 · 2023级本科生",
              photo: "/images/team/wuruoyi-shenghuozhao.jpg",
              description: "华中科技大学网络空间安全学院2023级本科生，参与InterFuzz项目，专注于编译器测试与自动化测试技术的研究，致力于提升Java编译器的稳定性和性能。",
              homepage: "",
              email: "",
            },
          ].map((m) => (
            <div key={m.name} className="card hover:border-white/20 transition-all duration-300 group">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="relative w-32 h-40 rounded-2xl border-2 border-white/20 group-hover:border-white/40 group-hover:shadow-lg transition-all duration-300 overflow-hidden shrink-0">
                  {m.photo ? (
                    <img 
                      src={m.photo} 
                      alt={m.name}
                      className="w-full h-full object-cover object-top"
                      onError={(e) => {
                        // 如果图片加载失败，显示初始字母
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        if (target.parentElement) {
                          target.parentElement.innerHTML = `<div class="w-full h-full bg-gradient-to-br from-sky-500/20 to-purple-500/20 grid place-items-center text-white text-2xl font-semibold">${m.name.slice(0, 1)}</div>`;
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-sky-500/20 to-purple-500/20 grid place-items-center text-white text-2xl font-semibold">
                      {m.name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-xl text-white group-hover:text-sky-300 transition-colors">
                    {m.name}
                  </div>
                  <div className="text-base text-white/70 mt-1">{m.role}</div>
                </div>
              </div>
              {m.description && (
                <p className="mt-4 text-white/80 text-sm leading-relaxed text-left">
                  {m.description}
                </p>
              )}
              {(m.homepage || m.email) && (
                <div className="mt-4 flex items-center gap-3 text-base">
                  {m.homepage && (
                    <a
                      href={m.homepage}
                      className="btn-ghost"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <LinkIcon size={14} /> 主页
                    </a>
                  )}
                  {m.email && (
                    <a href={`mailto:${m.email}`} className="btn-ghost">
                      <Mail size={14} /> 邮箱
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ARTS3 Research Group */}
      <section className="card">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500/20 to-purple-500/20 border border-white/10 grid place-items-center shadow-lg">
            <Building2 size={26} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-white mb-2">ARTS3 研究组</h2>
            <p className="text-white/90 text-base leading-relaxed">
              <strong className="text-white">ARTS3 研究组</strong>
              （Advanced Research for Trustworthy and Secure Software Systems）
              隶属于
              <strong className="text-sky-300">
                华中科技大学网络空间安全学院
              </strong>
              ，由<strong className="text-white">文明副教授</strong>指导。
              实验室专注于可信与安全软件系统的基础与应用研究，旨在探索构建高可靠、高安全性软件系统的新方法与新技术。
            </p>
            <p className="mt-3 text-white/80 text-base leading-relaxed">
              研究方向涵盖软件安全、软件测试与分析、代码大模型等领域，
              聚焦于模糊测试、静态与动态分析、软件供应链安全，以及智能化软件工程技术。
              <strong className="text-white">InterFuzz</strong>是实验室在编译器测试领域的重要研究成果，
              面向复杂"类间结构"的高层程序图（HPG）建模与变异，引导性挖掘 Java 优化编译器缺陷。
              团队致力于探索智能化、可扩展的软件测试技术，以推动可信软件系统与自动化验证的发展。
            </p>

            <div className="mt-4 flex flex-wrap gap-2.5">
              <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-500/10 to-sky-500/5 text-sky-300 text-sm border border-sky-500/30 hover:border-sky-500/50 transition-all font-medium">
                软件安全
              </span>
              <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-500/10 to-purple-500/5 text-purple-300 text-sm border border-purple-500/30 hover:border-purple-500/50 transition-all font-medium">
                软件测试与分析
              </span>
              <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500/10 to-pink-500/5 text-pink-300 text-sm border border-pink-500/30 hover:border-pink-500/50 transition-all font-medium">
                代码大模型
              </span>
              <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 text-emerald-300 text-sm border border-emerald-500/30 hover:border-emerald-500/50 transition-all font-medium">
                软件供应链安全
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Labs - Side by side */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* CGCL Laboratory */}
        <section className="card">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 border border-white/10 grid place-items-center shadow-lg flex-shrink-0">
              <Building2 size={26} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-semibold text-white mb-3">集群与网格计算湖北省重点实验室</h2>
              <p className="text-white/80 text-base leading-relaxed">
                华中科技大学"服务计算技术与系统教育部重点实验室"暨"集群与网格计算湖北省重点实验室"依托于计算机系统结构国家重点学科，拥有自由开放的学术氛围和国际前沿的研究方向。实验室致力于系统软件与体系结构、分布式系统、网络空间安全、大数据等领域的研究与创新，在分布式计算、云计算、大数据处理等方向具有丰富的理论积累与工程实践经验。
              </p>
            </div>
          </div>
        </section>

        {/* Distributed Systems Lab */}
        <section className="card">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 grid place-items-center shadow-lg flex-shrink-0">
              <Building2 size={26} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-semibold text-white mb-3">分布式系统安全湖北省重点实验室</h2>
              <p className="text-white/80 text-base leading-relaxed">
                华中科技大学分布式系统实验室致力于分布式计算、分布式存储、分布式系统架构等前沿技术的研究与创新。实验室在分布式系统设计、容错机制、一致性协议、分布式调度等方向具有丰富的理论积累与工程实践经验。
              </p>
            </div>
          </div>
        </section>
      </div>
      </div>
    </div>
  );
}
