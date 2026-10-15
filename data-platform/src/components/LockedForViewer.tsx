import React from 'react';
import { Lock } from 'lucide-react';

/**
 * 体验/外部账号(viewer)的功能锁定包裹：
 * - locked=false 时原样渲染子内容（内部角色不受影响）；
 * - locked=true 时子内容禁用交互（pointer-events/select/inert 关闭），
 *   上覆遮罩与锁提示，让体验账号「看得到入口，但用不了」。
 *
 * 调用方自己算 locked（通常是 user?.role === 'viewer'），本组件不判角色，
 * 因为有些地方的判据不只是角色（如报告平台按 canManage）。
 *
 * variant 决定遮多狠：
 * - 'blur'（默认）：子内容模糊 + 居中卡片。用于报告生成表单——表单里有车型
 *   下拉等内容，本来就不该让体验账号读清。
 * - 'dim'：子内容只压暗不模糊 + 居中单行胶囊。用于首页 AskAI 问答框——
 *   要让人认出这是个输入框（「看得到才想升级」），糊掉就只剩一个提示框了。
 *
 * 与 TrialMoreHint 的区别：那个是列表被裁剪后的一行文字提示，这个是整块功能遮罩。
 */
const LockedForViewer: React.FC<{
    locked: boolean;
    hint: string;
    variant?: 'blur' | 'dim';
    children: React.ReactNode;
}> = ({ locked, hint, variant = 'blur', children }) => {
    // pointer-events-none 只挡鼠标，Tab 键仍能聚焦到模糊层里的输入框/按钮。
    // React 18 的 TS 类型还没有 inert 属性，用 ref 直接落到 DOM 上。
    const veilRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        if (locked) veilRef.current?.setAttribute('inert', '');
    }, [locked]);

    if (!locked) return <>{children}</>;

    const dim = variant === 'dim';
    return (
        <div className="relative">
            {/* aria-hidden + inert：被锁层不可聚焦、不可点击、不进无障碍树 */}
            <div
                ref={veilRef}
                className={`pointer-events-none select-none ${dim ? 'opacity-70' : 'blur-sm opacity-60'}`}
                aria-hidden
            >
                {children}
            </div>
            {/* dim 模式不加 backdrop-blur，否则输入框边框和 placeholder 一起糊掉 */}
            <div className={`absolute inset-0 flex items-center justify-center rounded-2xl ${dim ? 'bg-surface/30' : 'bg-surface/40 backdrop-blur-[2px]'}`}>
                {dim ? (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-raised/95 border border-amber-500/25 shadow-lg shadow-ink/30">
                        <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span className="text-xs text-text-secondary">{hint}</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-xl bg-surface-raised/90 border border-ink/[0.1] shadow-lg">
                        <div className="w-11 h-11 rounded-full bg-amber-500/15 flex items-center justify-center">
                            <Lock className="w-5 h-5 text-amber-700" />
                        </div>
                        <p className="text-sm text-text-secondary text-center max-w-xs">{hint}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LockedForViewer;
