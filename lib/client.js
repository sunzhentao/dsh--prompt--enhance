// prompt-enhance — Browser half (static profile plugin, hand-written in the
// web module-loader bundle format; no build step).
// v1.1.0 客户端：✦ 增强按钮（多模式：基础/标准/专家）+ 模式选择菜单 +
// 增强结果对比面板（原文/增强后，采用或放弃）+ 采用后可撤回 +
// 空输入禁用。调用 Host 路由 /api/prompt-enhance/enhance via fetch（同源）。
window.__ModuleLoader__.load({
	id: "prompt-enhance",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		const React = require("react");

		const PE_CSS =
			".pe-shell{position:relative;display:inline-flex;align-items:center;gap:2px;flex:none}" +
			".pe-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s ease,color .15s ease;flex:none}" +
			".pe-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}" +
			".pe-btn:active:not(:disabled){background:var(--dsw-alias-bg-layer-1)}" +
			".pe-btn:disabled{opacity:.55;cursor:default}" +
			".pe-btn svg{display:block}" +
			".pe-spin{animation:pe-spin .9s linear infinite}" +
			"@keyframes pe-spin{to{transform:rotate(360deg)}}" +
			// 模式选择按钮（✦ 左侧）
			".pe-modebtn{display:inline-flex;align-items:center;gap:3px;height:26px;padding:0 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1;cursor:pointer;transition:background .15s ease,color .15s ease;flex:none}" +
			".pe-modebtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}" +
			".pe-modebtn:disabled{opacity:.55;cursor:default}" +
			".pe-menu{position:absolute;bottom:calc(100% + 8px);right:0;min-width:170px;padding:4px;display:flex;flex-direction:column;gap:1px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;box-shadow:0 8px 24px rgb(0 0 0/.16);z-index:70}" +
			".pe-menu-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border:none;border-radius:7px;background:transparent;font-size:12.5px;text-align:left;color:var(--dsw-alias-label-primary);cursor:pointer}" +
			".pe-menu-item:hover{background:var(--dsw-alias-bg-layer-2)}" +
			".pe-menu-item.pe-active{color:var(--dsw-alias-state-success-primary);font-weight:600}" +
			".pe-menu-item .pe-menu-hint{font-size:11px;color:var(--dsw-alias-label-secondary);font-weight:400}" +
			".pe-check{color:var(--dsw-alias-state-success-primary);font-size:12px}" +
			// 浮动提示（原有）+ 带操作按钮的提示
			".pe-overlay-notice{position:absolute;top:8px;left:50%;transform:translateX(-50%);max-width:min(380px,calc(100% - 32px));padding:6px 12px;border-radius:10px;font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);box-shadow:0 6px 18px rgb(0 0 0/.14);pointer-events:none;z-index:60}" +
			".pe-overlay-notice.pe-error{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}" +
			".pe-overlay-notice.pe-info{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}" +
			".pe-overlay-notice.pe-with-action{display:flex;align-items:center;gap:8px;pointer-events:auto}" +
			".pe-undo-action{flex:none;padding:2px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;cursor:pointer}" +
			".pe-undo-action:hover{background:var(--dsw-alias-bg-layer-1)}" +
			// 对比面板
			".pe-compare{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);width:min(720px,calc(100% - 24px));max-height:62vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 12px 32px rgb(0 0 0/.18);z-index:70;overflow:hidden}" +
			".pe-compare-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}" +
			".pe-compare-cols{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--dsw-alias-border-l1);overflow:hidden;flex:1;min-height:0}" +
			".pe-compare-col{background:var(--dsw-alias-bg-layer-1);padding:12px 14px;overflow:auto;max-height:40vh}" +
			".pe-compare-col-title{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:8px}" +
			".pe-compare-text{font-size:13px;line-height:20px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}" +
			".pe-compare-foot{display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l1)}" +
			// 待确认段（仅参考，不写入正文）
			".pe-confirm{margin:10px 14px 0;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}" +
			".pe-confirm-title{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);margin-bottom:4px}" +
			".pe-confirm-body{font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}" +
			".pe-ghost{padding:5px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12.5px;cursor:pointer}" +
			".pe-ghost:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}" +
			".pe-primary{padding:5px 14px;border:none;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:600;cursor:pointer}" +
			".pe-primary:hover{background:var(--dsw-alias-bg-layer-1)}" +
			// 忙碌状态卡（含计时与取消）
			".pe-busy{position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:12px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);box-shadow:0 8px 24px rgb(0 0 0/.16);z-index:70;pointer-events:auto;font-size:12.5px;white-space:nowrap}" +
			".pe-busy-spin{animation:pe-spin .9s linear infinite;color:var(--dsw-alias-state-success-primary);display:inline-flex;flex:none}" +
			".pe-busy-text{display:inline-flex;flex-direction:column;gap:2px;line-height:1.35;text-align:left}" +
			".pe-busy-mode{font-weight:600}" +
			".pe-busy-elapsed{font-size:11px;color:var(--dsw-alias-label-secondary)}" +
			".pe-busy-cancel{flex:none;padding:4px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}" +
			".pe-busy-cancel:hover{background:var(--dsw-alias-bg-layer-1)}";

		const MODES = [
			{ id: "basic", label: "基础", hint: "快速文本润色" },
			{ id: "standard", label: "标准", hint: "结合项目上下文" },
			{ id: "expert", label: "专家", hint: "深度上下文＋任务分析" },
		];
		const MODE_KEY = "prompt-enhance:mode";
		const modeLabel = (id) => {
			const m = MODES.find((x) => x.id === id);
			return m ? m.label : "标准";
		};
		function loadMode() {
			try {
				const m = localStorage.getItem(MODE_KEY);
				if (m && MODES.some((x) => x.id === m)) return m;
			} catch (e) { /* ignore */ }
			return "standard";
		}
		function saveMode(m) {
			try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ }
		}

		const inject = ["slots"];

		function apply(ctx) {
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-prompt-enhance", "");
				style.textContent = PE_CSS;
				document.head.appendChild(style);
				return () => { if (style.parentNode) style.parentNode.removeChild(style); };
			}, "prompt-enhance: styles");

			// 浏览器端错误捕获：上报 Host 诊断环（排查“转圈后不可用”）
			ctx.effect(() => {
				const onErr = (ev) => {
					const msg = ev && ev.message ? ev.message : (ev && ev.reason ? String(ev.reason) : String(ev));
					const err = ev && ev.error ? ev.error : (ev && ev.reason ? ev.reason : null);
					const stack = err && err.stack ? String(err.stack).slice(0, 800) : "";
					try {
						fetch("/api/prompt-enhance/log-error", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ msg: String(msg).slice(0, 400), stack }),
						});
					} catch (e) { /* ignore */ }
				};
				window.addEventListener("error", onErr);
				window.addEventListener("unhandledrejection", onErr);
				return () => {
					window.removeEventListener("error", onErr);
					window.removeEventListener("unhandledrejection", onErr);
				};
			}, "prompt-enhance: error trap");

			// 共享状态机：idle / busy / compare / undo / notice
			let current = null;
			let dismissHandle = null;
			let undoHandle = null;
			const listeners = new Set();
			const notify = () => { for (const fn of listeners) fn(); };
			const timer = ctx.get("timer");
			const clearTimers = () => {
				if (dismissHandle) { dismissHandle(); dismissHandle = null; }
				if (undoHandle) { undoHandle(); undoHandle = null; }
			};
			const publish = (state) => {
				clearTimers();
				current = { seq: (current ? current.seq : 0) + 1, ...state };
				// 定时器失败绝不阻塞状态推进（否则 UI 会冻结在上一个状态）
				try {
					if (current.phase === "notice") {
						dismissHandle = timer ? timer.timeout(() => { current = null; notify(); }, 3600) : null;
					} else if (current.phase === "undo") {
						undoHandle = timer ? timer.timeout(() => { current = null; notify(); }, 9000) : null;
					}
				} catch (e) {
					console.error("prompt-enhance timer failed", e);
				}
				notify();
			};
			const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

			// 当前进行中的增强请求（用于取消）
			let activeAbort = null;
			const cancelEnhance = () => { if (activeAbort) activeAbort.abort(); };

			// 实时草稿镜像：RightControls 每次渲染写入（overlay 槽无 input 属性，改用镜像，
			// 不在 overlay 调用 useInput 钩子，避免钩子不可用时整个输入区崩溃）
			const draftMirror = { value: null };

			const runEnhance = async (props, mode) => {
				const draft = (props.input && props.input.draft) || "";
				if (!draft.trim()) {
					publish({ phase: "notice", kind: "error", text: "输入框为空：请先输入要增强的提示词。" });
					return;
				}
				const original = draft;
				const ctrl = new AbortController();
				activeAbort = ctrl;
				publish({ phase: "busy", mode, text: "正在增强（" + modeLabel(mode) + "）…" });
				try {
					const response = await fetch("/api/prompt-enhance/enhance", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ sessionId: props.sessionId, draft, mode }),
						signal: ctrl.signal,
					});
					let result = null;
					try { result = await response.json(); } catch (e) { result = null; }
					if (result && result.ok && typeof result.enhanced === "string" && result.enhanced) {
						publish({ phase: "compare", mode, original, enhanced: result.enhanced, confirmations: (result.confirmations || "").trim() });
					} else if (result && result.canceled) {
						publish({ phase: "notice", kind: "info", text: "已取消增强。" });
					} else {
						publish({ phase: "notice", kind: "error", text: (result && result.message) || "提示词增强失败，已保留原始输入。" });
					}
				} catch (e) {
					if (ctrl.signal.aborted) {
						publish({ phase: "notice", kind: "info", text: "已取消增强。" });
					} else {
						console.error("prompt-enhance rpc failed", e);
						publish({ phase: "notice", kind: "error", text: "提示词增强失败：" + (e && e.message ? e.message : String(e)) });
					}
				} finally {
					if (activeAbort === ctrl) activeAbort = null;
				}
			};

			const adopt = (props) => {
				const s = current;
				if (!s || s.phase !== "compare") return;
				// 实时草稿来自 draftMirror（RightControls 渲染时写入）。镜像为空时退化为直接采用。
				const nowDraft = draftMirror.value;
				if (nowDraft !== null && nowDraft.trim() !== s.original.trim()) {
					publish({ phase: "notice", kind: "error", text: "增强期间输入框内容已变化，增强结果未覆盖（可再次点击重试）。" });
					return;
				}
				if (props.inputActions) {
					props.inputActions.setDraft(s.enhanced);
					publish({ phase: "undo", original: s.original, text: "已采用增强结果" });
				} else {
					publish({ phase: "notice", kind: "error", text: "输入框不可写，无法写入增强结果。" });
				}
			};

			const discard = () => {
				publish({ phase: "notice", kind: "info", text: "已放弃增强结果，保留原输入。" });
			};

			const undoAction = (props) => {
				const s = current;
				if (!s || s.phase !== "undo" || !s.original) return;
				if (props.inputActions) props.inputActions.setDraft(s.original);
				publish({ phase: "notice", kind: "info", text: "已撤回原文。" });
			};

			// ---- conversation.input.right：模式选择 + ✦ 增强按钮 ----
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register(
				{ name: "conversation.input.right", id: "prompt-enhance", order: 0, label: "提示词增强" },
				(props) => {
					const [, setTick] = React.useState(0);
					const [mode, setMode] = React.useState(loadMode);
					const [menuOpen, setMenuOpen] = React.useState(false);
					const wrapRef = React.useRef(null);
					React.useEffect(() => subscribe(() => setTick((t) => t + 1)), []);
					const phase = props.input ? props.input.phase : "plain";
					const draft = (props.input && props.input.draft) || "";
					// 镜像最新草稿（右槽随输入 store 变化重渲染，adopt 用它做变化检测）
					if (props.input && typeof props.input.draft === "string") draftMirror.value = props.input.draft;
					const busy = !!(current && current.phase === "busy");
					const disabled = busy || phase !== "plain" || !draft.trim();

					React.useEffect(() => {
						if (!menuOpen) return;
						const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false); };
						document.addEventListener("pointerdown", onDown);
						return () => document.removeEventListener("pointerdown", onDown);
					}, [menuOpen]);

					const choose = (id) => {
						setMode(id);
						saveMode(id);
						setMenuOpen(false);
						publish({ phase: "notice", kind: "info", text: "增强模式已切换为：" + modeLabel(id) });
					};

					const caret = React.createElement("svg", { viewBox: "0 0 16 16", width: "10", height: "10", "aria-hidden": true },
						React.createElement("path", { d: "M4 6l4 4 4-4", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" }));
					const spinner = React.createElement("svg", { className: "pe-spin", viewBox: "0 0 16 16", width: "15", height: "15", "aria-hidden": true },
						React.createElement("path", { d: "M8 1.5a6.5 6.5 0 1 0 6.5 6.5H13A5 5 0 1 1 8 3V1.5z", fill: "currentColor" }));
					const star = React.createElement("svg", { viewBox: "0 0 16 16", width: "15", height: "15", "aria-hidden": true },
						React.createElement("path", { d: "M9.245 2.5a.75.75 0 0 1 .51.37l1.1 2.17 2.17 1.1a.75.75 0 0 1 0 1.38l-2.17 1.1-1.1 2.17a.75.75 0 0 1-1.38 0l-1.1-2.17-2.17-1.1a.75.75 0 0 1 0-1.38l2.17-1.1 1.1-2.17a.75.75 0 0 1 .77-.37zm2.255 9.5a.75.75 0 0 1 .71.51l.4 1.08 1.08.4a.75.75 0 0 1 0 1.42l-1.08.4-.4 1.08a.75.75 0 0 1-1.42 0l-.4-1.08-1.08-.4a.75.75 0 0 1 0-1.42l1.08-.4.4-1.08a.75.75 0 0 1 .71-.51z", fill: "currentColor" }));

					return React.createElement("div", { className: "pe-shell", ref: wrapRef },
						React.createElement("button", {
							type: "button",
							className: "pe-modebtn",
							disabled: busy,
							title: "增强模式：" + modeLabel(mode) + "（点击切换）",
							"aria-label": "选择提示词增强模式",
							"aria-expanded": menuOpen,
							onClick: () => setMenuOpen(!menuOpen),
						},
							React.createElement("span", null, modeLabel(mode)),
							caret
						),
						menuOpen && React.createElement("div", { className: "pe-menu", role: "menu" },
							MODES.map((m) => React.createElement("button", {
								key: m.id,
								type: "button",
								role: "menuitem",
								className: "pe-menu-item" + (m.id === mode ? " pe-active" : ""),
								onClick: () => choose(m.id),
							},
								React.createElement("span", null,
									React.createElement("span", null, m.label),
									React.createElement("span", { className: "pe-menu-hint" }, "  " + m.hint)
								),
								m.id === mode ? React.createElement("span", { className: "pe-check" }, "✓") : null
							))
						),
						React.createElement("button", {
							type: "button",
							className: "pe-btn",
							"aria-label": "提示词增强：读取项目上下文并重写输入框中的提示词",
							title: "提示词增强（" + modeLabel(mode) + "）：结合项目上下文重写输入框中的提示词",
							disabled,
							onClick: () => runEnhance(props, mode),
						}, busy ? spinner : star)
					);
				}
			));

			// ---- conversation.input.overlay：对比面板 / 撤回提示 / 状态提示 ----
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register(
				{ name: "conversation.input.overlay", id: "prompt-enhance-notice", order: 0, label: "提示词增强提示" },
				(props) => {
					const [s, setS] = React.useState(current ? { ...current } : null);
					React.useEffect(() => subscribe(() => setS(current ? { ...current } : null)), []);
					const [elapsed, setElapsed] = React.useState(0);
					React.useEffect(() => {
						if (!s || s.phase !== "busy") { setElapsed(0); return; }
						const started = Date.now();
						setElapsed(0);
						const t = ctx.get("timer");
						if (!t) return;
						let fired = false;
						const h = t.interval(() => {
							if (fired) return;
							const secs = Math.floor((Date.now() - started) / 1000);
							setElapsed(secs);
							if (secs >= 120) {
								fired = true;
								h();
								if (activeAbort) activeAbort.abort();
								publish({ phase: "notice", kind: "error", text: "增强超时（>120 秒），已取消。请重试。" });
							}
						}, 1000);
						return h;
					}, [s ? s.seq : 0]);
					if (!s) return null;

					if (s.phase === "compare") {
						const confirm = s.confirmations ? React.createElement("div", { className: "pe-confirm" },
							React.createElement("div", { className: "pe-confirm-title" }, "待确认事项（仅参考，不会写入正文）"),
							React.createElement("div", { className: "pe-confirm-body" }, s.confirmations)
						) : null;
						return React.createElement("div", { key: s.seq, className: "pe-compare", role: "dialog", "aria-label": "提示词增强结果对比" },
							React.createElement("div", { className: "pe-compare-head" },
								React.createElement("span", null, "增强结果对比（" + modeLabel(s.mode) + "）")
							),
							React.createElement("div", { className: "pe-compare-cols" },
								React.createElement("div", { className: "pe-compare-col" },
									React.createElement("div", { className: "pe-compare-col-title" }, "原文"),
									React.createElement("div", { className: "pe-compare-text" }, s.original)
								),
								React.createElement("div", { className: "pe-compare-col" },
									React.createElement("div", { className: "pe-compare-col-title" }, "增强后"),
									React.createElement("div", { className: "pe-compare-text" }, s.enhanced)
								)
							),
							confirm,
							React.createElement("div", { className: "pe-compare-foot" },
								React.createElement("button", { type: "button", className: "pe-ghost", onClick: () => discard() }, "放弃"),
								React.createElement("button", { type: "button", className: "pe-primary", onClick: () => adopt(props) }, "采用增强结果")
							)
						);
					}

					if (s.phase === "undo") {
						return React.createElement("div", { key: s.seq, role: "status", className: "pe-overlay-notice pe-info pe-with-action" },
							React.createElement("span", null, s.text),
							React.createElement("button", { type: "button", className: "pe-undo-action", onClick: () => undoAction(props) }, "↩ 撤回")
						);
					}

					if (s.phase === "busy") {
						const spin = React.createElement("svg", { className: "pe-busy-spin", viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": true },
							React.createElement("path", { d: "M8 1.5a6.5 6.5 0 1 0 6.5 6.5H13A5 5 0 1 1 8 3V1.5z", fill: "currentColor" }));
						return React.createElement("div", { key: s.seq, role: "status", className: "pe-busy" },
							spin,
							React.createElement("span", { className: "pe-busy-text" },
								React.createElement("span", { className: "pe-busy-mode" }, s.text),
								React.createElement("span", { className: "pe-busy-elapsed" }, "已用时 " + elapsed + " 秒，可稍候或取消")
							),
							React.createElement("button", { type: "button", className: "pe-busy-cancel", onClick: cancelEnhance }, "取消")
						);
					}

					return React.createElement("div", { key: s.seq, role: "status", className: "pe-overlay-notice pe-" + s.kind }, s.text);
				}
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});