import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getShopName } from "../utils/runtimeConfig";

const MODAL_EASE = [0.22, 1, 0.36, 1];

const TABS = [
  { key: "terms", label: "服务条款", icon: "fa-file-contract" },
  { key: "privacy", label: "隐私政策", icon: "fa-shield-alt" },
];

function TermsContent({ shopName }) {
  return (
    <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
      <p className="text-gray-500 text-xs">最后更新日期：2025年7月1日</p>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">一、服务概述</h3>
        <p>
          欢迎使用{shopName}
          （以下简称"本平台"）。本平台是面向校园用户的在线购物服务平台，
          为在校师生提供商品浏览、下单购买、配送等服务。使用本平台前，请您仔细阅读并充分理解以下条款。
          注册或登录本平台即视为您已阅读、理解并同意遵守本服务条款。
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">二、用户资格与账户</h3>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            本平台仅面向本校在校师生开放注册和使用，用户需通过有效学号进行登录验证。
          </li>
          <li>
            每位用户仅可注册一个账户，不得将账户借给他人使用或进行账户交易。
          </li>
          <li>
            用户有义务妥善保管自己的账户信息和登录密码，因用户自身原因导致的账户安全问题由用户自行承担。
          </li>
          <li>如发现账户存在异常或被盗用情况，请立即联系平台管理员处理。</li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">三、商品与订单</h3>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            本平台展示的商品信息（包括但不限于价格、库存、描述等）可能随时发生变动，最终以下单时的实际信息为准。
          </li>
          <li>
            用户下单后应按照平台指定的方式完成支付。未在规定时间内完成支付的订单可能被自动取消。
          </li>
          <li>
            因商品库存不足、信息录入错误或其他不可抗力因素，平台保留取消异常订单的权利，并会及时通知用户。
          </li>
          <li>配送范围限于校园内指定区域，配送时间以平台实际安排为准。</li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">四、用户行为规范</h3>
        <p className="mb-2">使用本平台时，用户应遵守以下规范：</p>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>不得利用平台从事任何违法违规活动。</li>
          <li>
            不得通过技术手段干扰平台正常运行，包括但不限于恶意刷单、注入攻击、爬取数据等。
          </li>
          <li>不得发布虚假信息或进行恶意评价。</li>
          <li>不得利用平台漏洞谋取不当利益，发现漏洞应及时向平台反馈。</li>
          <li>应尊重其他用户和平台工作人员，不得进行骚扰、辱骂等不当行为。</li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">五、退换货政策</h3>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            因商品质量问题，用户可在收到商品后24小时内联系平台申请退换货。
          </li>
          <li>
            非质量问题的退换货需视具体商品类型而定，生鲜食品等特殊商品不支持无理由退换。
          </li>
          <li>退换货时商品应保持完好状态，不影响二次销售。</li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">六、知识产权</h3>
        <p>
          本平台的所有内容（包括但不限于界面设计、图标、文字、图片、代码等）均受知识产权法律保护。
          未经平台书面授权，任何人不得复制、修改、传播或以其他方式使用本平台的内容。
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">七、免责声明</h3>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            本平台为校园便利服务工具，不对商品本身的质量承担最终责任，相关责任由商品供应方承担。
          </li>
          <li>
            因网络故障、系统维护、不可抗力等原因导致的服务中断或数据丢失，平台不承担赔偿责任，但会尽力恢复服务。
          </li>
          <li>
            用户因违反本条款或相关法律法规所导致的一切后果由用户自行承担。
          </li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">八、条款修改</h3>
        <p>
          本平台保留随时修改本服务条款的权利。条款修改后，平台将通过适当方式通知用户。
          用户在条款修改后继续使用本平台，即视为同意修改后的条款。
          如不同意修改后的条款，用户应停止使用本平台服务。
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">九、联系方式</h3>
        <p>如对本服务条款有任何疑问或建议，请联系平台管理员进行咨询。</p>
      </section>
    </div>
  );
}

function PrivacyContent({ shopName }) {
  return (
    <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
      <p className="text-gray-500 text-xs">最后更新日期：2025年7月1日</p>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">一、引言</h3>
        <p>
          {shopName}
          （以下简称"本平台"）高度重视用户的隐私保护。本隐私政策旨在说明我们如何收集、
          使用、存储和保护您的个人信息。请您在使用本平台服务前仔细阅读本政策。
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">二、信息收集</h3>
        <p className="mb-2">为提供和优化服务，我们可能收集以下类型的信息：</p>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            <strong>账户信息：</strong>
            学号、登录密码（加密存储）等注册登录所需的基本信息。
          </li>
          <li>
            <strong>配送信息：</strong>
            收货地址、楼栋号、联系方式等完成配送所需的信息。
          </li>
          <li>
            <strong>订单信息：</strong>
            购买的商品、订单金额、下单时间、支付状态等交易相关信息。
          </li>
          <li>
            <strong>设备信息：</strong>
            设备标识符、浏览器类型、操作系统版本等用于安全验证和服务优化的技术信息。
          </li>
          <li>
            <strong>使用记录：</strong>
            浏览记录、搜索记录、聊天记录等用于改善用户体验的交互信息。
          </li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">三、信息使用</h3>
        <p className="mb-2">我们收集的信息将用于以下目的：</p>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>提供、维护和改进本平台的各项服务功能。</li>
          <li>处理您的订单并完成商品配送。</li>
          <li>验证用户身份，保障账户和交易安全。</li>
          <li>向您推送订单状态更新、平台通知等服务相关信息。</li>
          <li>分析使用趋势，优化产品体验和服务质量。</li>
          <li>预防和处理欺诈、滥用等安全风险。</li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">四、信息存储与保护</h3>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            您的个人信息存储在受保护的服务器上，我们采取了合理的技术和管理措施来防止信息被未经授权的访问、使用或泄露。
          </li>
          <li>
            用户密码经过加密处理后存储，平台工作人员无法获取您的明文密码。
          </li>
          <li>
            我们仅在实现服务目的所必需的期限内保留您的个人信息。当信息不再需要时，我们将进行删除或匿名化处理。
          </li>
          <li>
            尽管我们已采取合理措施保护您的信息安全，但请理解互联网环境下不存在绝对安全的措施。
          </li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">五、信息共享</h3>
        <p className="mb-2">
          我们不会向第三方出售您的个人信息。在以下情况下，我们可能会共享您的信息：
        </p>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            <strong>配送需要：</strong>
            为完成商品配送，我们可能将您的收货地址和联系方式提供给配送人员。
          </li>
          <li>
            <strong>法律要求：</strong>
            在法律法规要求或政府机关依法要求的情况下。
          </li>
          <li>
            <strong>安全保护：</strong>
            为保护本平台、用户或公众的权益、财产或安全。
          </li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">六、用户权利</h3>
        <p className="mb-2">您对自己的个人信息享有以下权利：</p>
        <ol className="list-decimal list-inside space-y-1.5 pl-1">
          <li>
            <strong>查看权：</strong>您有权查看平台收集的与您相关的个人信息。
          </li>
          <li>
            <strong>更正权：</strong>如您发现个人信息有误，可联系平台进行更正。
          </li>
          <li>
            <strong>删除权：</strong>
            您有权要求删除您的个人信息（法律法规要求保留的除外）。
          </li>
          <li>
            <strong>注销权：</strong>
            您有权申请注销账户，注销后我们将删除或匿名化处理您的个人信息。
          </li>
        </ol>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">
          七、Cookie 和本地存储
        </h3>
        <p>
          本平台使用 Cookie
          和本地存储技术来维持您的登录状态、记住您的偏好设置以及保障服务安全。
          这些技术不会收集您在其他网站的信息。您可以通过浏览器设置管理或删除
          Cookie， 但这可能影响本平台部分功能的正常使用。
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">八、未成年人保护</h3>
        <p>
          本平台面向在校师生提供服务。如您是未满18周岁的未成年人，建议在监护人的指导下使用本平台服务，
          并请监护人帮助阅读和理解本隐私政策。
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">九、政策更新</h3>
        <p>
          我们可能会不时更新本隐私政策。更新后的政策将在本平台上公布，重大变更时我们会通过平台通知等方式告知您。
          建议您定期查阅本政策以了解最新的隐私保护措施。
        </p>
      </section>

      <section>
        <h3 className="font-semibold text-gray-800 mb-2">十、联系我们</h3>
        <p>
          如您对本隐私政策有任何疑问、意见或请求，请联系平台管理员，
          我们将在合理时间内回复您的请求。
        </p>
      </section>
    </div>
  );
}

export default function LegalModal({ open, onClose, initialTab = "terms" }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const shopName = getShopName();

  // Sync tab when opened with a different initialTab
  React.useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-lg max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ duration: 0.35, ease: MODAL_EASE }}
          >
            {/* Header */}
            <div className="flex-shrink-0 px-6 pt-5 pb-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">法律条款</h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                >
                  <i className="fas fa-times text-sm"></i>
                </button>
              </div>

              {/* Tabs */}
              <div className="relative flex bg-gray-100 rounded-xl p-1">
                {/* 滑动背景块 */}
                <motion.div
                  className="absolute top-1 bottom-1 bg-white rounded-lg shadow-sm"
                  style={{ width: `calc(50% - 4px)` }}
                  animate={{
                    x: activeTab === "terms" ? 0 : "100%",
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      activeTab === tab.key
                        ? "text-gray-800"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <i className={`fas ${tab.icon} text-xs`}></i>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 overscroll-contain">
              {activeTab === "terms" ? (
                <TermsContent shopName={shopName} />
              ) : (
                <PrivacyContent shopName={shopName} />
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100">
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm transition-colors"
              >
                我已了解
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
