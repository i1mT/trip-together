import { CalendarDays, FolderOpen, Wallet, ArrowRight } from "lucide-react";
import { TravelSticker } from "../travel-sticker";
export function EmptyWorkspace({
  tab,
  onManage,
  onCreate,
  onMarket,
}: {
  tab: string;
  onManage: () => void;
  onCreate: () => void;
  onMarket: () => void;
}) {
  const content =
    tab === "itinerary"
      ? {
          title: "还没有行程安排",
          text: "创建或加入行程后，在这里查看每日安排。",
          Icon: CalendarDays,
        }
      : tab === "documents"
        ? {
            title: "还没有行程资料",
            text: "机票、预订和共享文件会显示在这里。个人证件可以在“我的”中管理。",
            Icon: FolderOpen,
          }
        : {
            title: "还没有行程账本",
            text: "选择行程后，记录支出并与同行成员分摊。",
            Icon: Wallet,
          };
  return (
    <section className="page-content empty-workspace">
      {tab === "today" ? (
        <>
          <article className="onboarding-ticket">
            <div className="onboarding-ticket-body">
              <span className="status-pill">尚未添加行程</span>
              <TravelSticker kind="luggage" />
              <h1>还没有行程</h1>
              <p>创建自己的旅行计划，或去旅行攻略市场复制一份参考行程。</p>
            </div>
            <div className="onboarding-ticket-actions">
              <button className="primary-button" onClick={onCreate}>
                创建行程 <ArrowRight size={18} />
              </button>
              <button className="secondary-button" onClick={onMarket}>
                逛逛旅行攻略市场 <ArrowRight size={18} />
              </button>
            </div>
          </article>
          <div className="onboarding-note">
            <CalendarDays size={19} />
            <p>
              添加行程后，这里会显示接下来的安排。你也可以先在“我的”中修改昵称、整理个人证件。
            </p>
          </div>
        </>
      ) : (
        <div className="empty-workspace-message">
          <content.Icon size={34} strokeWidth={1.4} />
          <h1>{content.title}</h1>
          <p>{content.text}</p>
          <button className="secondary-button" onClick={onManage}>
            前往我的行程 <ArrowRight size={17} />
          </button>
        </div>
      )}
    </section>
  );
}
