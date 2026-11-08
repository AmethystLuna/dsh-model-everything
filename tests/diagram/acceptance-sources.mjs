// The acceptance corpus: the drawings a reader is shown, kept beside the suite that checks them.
//
// Each source exists for one difficulty - nesting, a turned layout, a fan-out, a legend, a state machine - and the case that
// reads this list requires every one of them to come out clean. A source that stops being clean fails by name.
export const ACCEPTANCE = [
  [
    "A · 分层架构（component + package）",
    "@startuml\npackage \"接入层\" as edge {\n  component \"Web 控制台\" as web\n  component \"移动端 BFF\" as bff\n  component \"开放 API 网关\" as api\n}\npackage \"应用层\" as app {\n  component \"订单服务\" as order\n  component \"库存服务\" as stock\n  component \"结算服务\" as billing\n  component \"通知服务\" as notify\n}\npackage \"领域层\" as domain {\n  component \"订单聚合\" as agg\n  component \"价格策略\" as price\n  component \"库存预留\" as reserve\n}\npackage \"基础设施\" as infra {\n  component \"事件总线\" as bus\n  component \"订单库\" as store\n  component \"支付网关\" as pay\n}\nweb --> api\nbff --> api\napi --> order\napi --> stock\norder --> billing\norder --> agg\nbilling --> price\nstock --> reserve\nagg --> store\norder ..> bus : 发布领域事件\nnotify ..> bus : 订阅\nbilling ..> pay : 扣款\nprice ..> reserve : 校验\n@enduml"
  ],
  [
    "B · 部署视图（node + artifact + database）",
    "@startuml\nnode \"边缘节点\" as cdn {\n  artifact \"静态资源\" as static\n  artifact \"TLS 终止\" as tls\n}\nnode \"应用集群\" as cluster {\n  artifact \"订单服务实例\" as inst1\n  artifact \"库存服务实例\" as inst2\n  artifact \"调度器\" as sched\n}\nnode \"数据层\" as data {\n  database \"订单主库\" as primary\n  database \"订单只读副本\" as replica\n  database \"缓存\" as cache\n}\nstatic --> tls\ntls --> inst1\ntls --> inst2\ninst1 --> primary\ninst2 --> cache\nsched --> inst1\nprimary ..> replica : 同步\ninst1 ..> cache : 读穿\n@enduml"
  ],
  [
    "C · 用例（usecase + package）",
    "@startuml\npackage \"订单系统边界\" as system {\n  usecase \"下单\" as place\n  usecase \"改单\" as modify\n  usecase \"取消\" as cancel\n  usecase \"查询物流\" as track\n  usecase \"对账\" as reconcile\n}\ncomponent \"买家\" as buyer\ncomponent \"客服\" as agent\ncomponent \"财务\" as finance\ncomponent \"承运商\" as carrier\nbuyer --> place\nbuyer --> track\nagent --> modify\nagent --> cancel\nfinance --> reconcile\ncarrier --> track\nmodify ..> cancel : 冲突时\nplace ..> reconcile : 记账\n@enduml"
  ],
  [
    "D · 状态机（state + 起止标记）",
    "@startuml\nstate \"待支付\" as pending\nstate \"已支付\" as paid\nstate \"备货中\" as picking\nstate \"已发货\" as shipped\nstate \"已签收\" as delivered\nstate \"退款中\" as refunding\nstate \"已关闭\" as closed\n[*] --> pending\npending --> paid : 支付成功\npending --> closed : 超时\npaid --> picking : 库存确认\npicking --> shipped : 出库\nshipped --> delivered : 签收\npaid --> refunding : 申请退款\nrefunding --> closed : 退款完成\ndelivered --> refunding : 售后\nclosed --> [*]\n@enduml"
  ],
  [
    "E · 数据模型（entity + 关系基数）",
    "@startuml\nentity \"订单\" as orders\nentity \"订单行\" as lines\nentity \"商品\" as product\nentity \"客户\" as customer\nentity \"支付流水\" as payment\nentity \"发货单\" as shipment\ncustomer --> orders : 1..*\norders *-- lines : 1..*\nlines --> product : 1..1\norders --> payment : 0..*\norders --> shipment : 0..1\nshipment ..> product : 承运\n@enduml"
  ],
  [
    "F · 循环依赖（用 ..> 画环）",
    "@startuml\ncomponent auth\ncomponent session\ncomponent profile\ncomponent billing\ncomponent audit\ncomponent gateway\nauth ..> session : 校验\nsession ..> profile : 读取\nprofile ..> auth : 反查\nbilling ..> session : 计费\naudit ..> billing : 记录\ngateway --> auth\ngateway --> billing\ngateway --> audit\n@enduml"
  ]
  ,
  [
    "G · 隐藏边（-[hidden]-> 只排不画）",
    "@startuml\ncomponent \"Web 控制台\" as web\ncomponent \"开放 API\" as api\ncomponent \"批处理作业\" as job\ncomponent \"订单库\" as db\nweb --> api\napi --> db\njob -[hidden]-> db\n@enduml"
  ]
  ,
  [
    "H · 同行（together 把两个服务并排）",
    "@startuml\ntogether {\n  component \"订单服务\" as order\n  component \"库存服务\" as stock\n}\ncomponent \"网关\" as gateway\ngateway --> order\norder --> stock\n@enduml"
  ]
  ,
  [
    "I · 逐边方向（-right-> 并排，-up-> 反向）",
    "@startuml\ncomponent \"A\" as a\ncomponent \"B\" as b\ncomponent \"C\" as c\na -right-> b\nb -up-> c\n@enduml"
  ]
  ,
  [
    "J · 横排（left to right direction）",
    "@startuml\nleft to right direction\npackage \"接入\" as edge {\n  component \"网关\" as gateway\n}\npackage \"应用\" as app {\n  component \"订单服务\" as order\n  component \"库存服务\" as stock\n}\npackage \"数据\" as data {\n  component \"订单库\" as db\n}\ngateway --> order\ngateway --> stock\norder --> db\nstock --> db\n@enduml"
  ]
  ,
  [
    "K · 注释（note 折角）",
    "@startuml\ncomponent \"订单服务\" as order\ncomponent \"库存服务\" as stock\nnote \"超时重试三次\" as retry\norder --> stock : 扣减\norder --> retry\n@enduml"
  ]
  ,
  [
    "L · 标记（file / card / frame）",
    "@startuml\nfile \"配置中心\" as config\ncard \"支付卡\" as card\nframe \"超时策略\" as policy\ncomponent \"结算服务\" as billing\nconfig --> billing\ncard --> billing\npolicy --> billing\n@enduml"
  ]
  ,
  [
    "M · 容器（queue / stack / storage）",
    "@startuml\ncomponent \"网关\" as gw\nqueue \"事件队列\" as q\nstack \"调用栈\" as s\nstorage \"对象存储\" as o\ngw --> q\ngw --> s\ngw --> o\n@enduml"
  ]
  ,
  [
    "N · 角色（boundary / control / collections）",
    "@startuml\nboundary \"边界\" as b\ncontrol \"控制器\" as c\ncollections \"集合\" as col\ncomponent \"核心\" as core\nb --> core\nc --> core\ncol --> core\n@enduml"
  ]
  ,
  [
    "O · 图例（legend 块）",
    "@startuml\ncomponent \"订单服务\" as order\ncomponent \"库存服务\" as stock\norder --> stock : 扣减\nlegend\n  实线：同步调用\n  虚线：领域事件\nend legend\n@enduml"
  ]
  ,
  [
    "P · 横排长边（跳过一层）",
    "@startuml\nleft to right direction\ncomponent \"接入\" as a\ncomponent \"应用\" as b\ncomponent \"数据\" as c\na --> b\nb --> c\na --> c : 直连\n@enduml"
  ]
  ,
  [
    "Q · 扇出（一个盒子十条边）",
    "@startuml\ncomponent \"事件总线\" as hub\ncomponent \"消费者 1\" as c0\ncomponent \"消费者 2\" as c1\ncomponent \"消费者 3\" as c2\ncomponent \"消费者 4\" as c3\ncomponent \"消费者 5\" as c4\ncomponent \"消费者 6\" as c5\ncomponent \"消费者 7\" as c6\ncomponent \"消费者 8\" as c7\nhub --> c0\nhub --> c1\nhub --> c2\nhub --> c3\nhub --> c4\nhub --> c5\nhub --> c6\nhub --> c7\n@enduml"
  ]
  ,
  [
    "R · 横排（Mermaid flowchart LR）",
    "flowchart LR\n  a[接入层] --> b[应用层]\n  b --> c[数据层]\n  b --> d[缓存]"
  ]
  ,
  [
    "S · 组合（横排 + 嵌套包 + together + 隐藏边）",
    "@startuml\nleft to right direction\npackage \"接入\" as edge {\n  component \"网关\" as gw\n}\npackage \"应用\" as app {\n  together {\n    component \"订单\" as order\n    component \"库存\" as stock\n  }\n}\ncomponent \"计价\" as price\ncomponent \"数据库\" as db\ngw --> order\ngw --> stock\norder --> price : 计算\nstock -[hidden]-> price\nprice --> db : 落库\n@enduml"
  ]
]
