---
frames:
  - id: avatar_talking_default
    name: 数字人口播
    shotType: avatar_talking
    duration: 5
    description: 数字人半身口播，适合开场种草与卖点讲解。
    variables:
      - scriptText
      - avatarUrl
    defaultData:
      scriptText: 大家好，今天给大家推荐一款超值的商品。

  - id: product_showcase_default
    name: 产品展示
    shotType: product_showcase
    duration: 5
    description: 产品居中展示，带有价格标签和卖点文案。
    variables:
      - productName
      - productImageUrl
      - tagline
      - price
      - brandColor
    defaultData:
      productName: 商品名称
      productImageUrl: https://via.placeholder.com/720
      tagline: 核心卖点一句话
      price: 99
      brandColor: "#ff5600"
    hyperframesTemplate: product_showcase

  - id: text_overlay_default
    name: 文字标题卡
    shotType: text_overlay
    duration: 3
    description: 大字标题卡片，适合章节切换和强调信息。
    variables:
      - title
      - subtitle
      - brandColor
    defaultData:
      title: 核心标题
      subtitle: 补充说明

  - id: closing_default
    name: 结尾品牌卡
    shotType: closing
    duration: 4
    description: 品牌 LOGO 与行动号召，适合视频结尾。
    variables:
      - brandName
      - ctaText
      - brandColor
    defaultData:
      brandName: 零一数字人导购平台
      ctaText: 立即选购

  - id: fire_advertisement
    name: 服饰种草
    shotType: avatar_talking
    duration: 6
    description: 服饰穿搭种草口播，适合带货开场。
    variables:
      - scriptText
      - avatarUrl
    defaultData:
      scriptText: 还有谁冬天只会穿那种假肢感很重的光腿神器？真的太土了。今天必须安利这条灰色打底裤，高级又百搭。

  - id: fire_beauty
    name: 美妆安利
    shotType: avatar_talking
    duration: 6
    description: 美妆产品惊艳体验口播。
    variables:
      - scriptText
      - avatarUrl
    defaultData:
      scriptText: 家人们，真的被这个粉底液惊艳到了！必须按头安利给你们，底妆直接焊在脸上。

  - id: fire_food
    name: 美食制作
    shotType: product_showcase
    duration: 6
    description: 美食制作展示，适合食品类带货。
    variables:
      - productName
      - productImageUrl
      - tagline
      - price
      - brandColor
    defaultData:
      productName: 鲜鲍鱼
      productImageUrl: https://via.placeholder.com/720
      tagline: 给平淡生活加点料
      price: 199
      brandColor: "#ff5600"

  - id: fire_travel
    name: 旅行日记
    shotType: text_overlay
    duration: 4
    description: 旅行场景大字标题卡。
    variables:
      - title
      - subtitle
      - brandColor
    defaultData:
      title: 奔赴一场青春派对
      subtitle: 周末阳光正好

  - id: fire_pet
    name: 宠物日常
    shotType: avatar_talking
    duration: 5
    description: 宠物视角活泼口播。
    variables:
      - scriptText
      - avatarUrl
    defaultData:
      scriptText: 想不想和修勾一起逛漫展？想去的姨姨别走开，带上我的“和服美少女”麻麻，一起出发！

  - id: fire_car
    name: 汽车体验
    shotType: avatar_talking
    duration: 6
    description: 汽车探店体验分享口播。
    variables:
      - scriptText
      - avatarUrl
    defaultData:
      scriptText: 家人们，我也去凑热闹了。本来想着网上吹得那么凶，多少有点营销成分吧？结果今天路过门店，腿一软就进去了。

  - id: fire_crazy
    name: 高能种草
    shotType: text_overlay
    duration: 4
    description: 情绪化、强共鸣的标题卡。
    variables:
      - title
      - subtitle
      - brandColor
    defaultData:
      title: 我不允许没人看过这个！！
      subtitle: 帅得我神志不清

presets:
  colorPalette:
    - id: c_orange
      name: 数字橙
      value: "#ff5600"
    - id: c_yellow
      name: 暖黄
      value: "#ffb800"
    - id: c_blue
      name: 信赖蓝
      value: "#2563eb"
    - id: c_red
      name: 促销红
      value: "#ff2e00"
    - id: c_dark
      name: 深色字
      value: "#111111"
    - id: c_white
      name: 纯白
      value: "#ffffff"
    - id: c_soft
      name: 浅粉底
      value: "#fff0e8"

  textStyles:
    - id: ts_title
      name: 大标题
      role: heading
      fontFamily: "'PingFang SC', 'Noto Sans SC', sans-serif"
      fontSize: 72
      fontWeight: 700
      color: "#111111"
      lineHeight: 1.15
      letterSpacing: "-0.02em"
      textAlign: center
    - id: ts_subtitle
      name: 副标题
      role: subheading
      fontFamily: "'PingFang SC', 'Noto Sans SC', sans-serif"
      fontSize: 42
      fontWeight: 500
      color: "#626260"
      lineHeight: 1.4
      textAlign: center
    - id: ts_price
      name: 价格标签
      role: price
      fontFamily: "'PingFang SC', 'Noto Sans SC', sans-serif"
      fontSize: 52
      fontWeight: 700
      color: "#ffffff"
      lineHeight: 1.2
      textAlign: center
      backgroundColor: "#ff5600"
      padding: "18px 56px"
      borderRadius: 9999
    - id: ts_badge
      name: 角标
      role: badge
      fontFamily: "'PingFang SC', 'Noto Sans SC', sans-serif"
      fontSize: 32
      fontWeight: 700
      color: "#ffffff"
      lineHeight: 1
      textAlign: center
      backgroundColor: "#ff2e00"
      padding: "18px 28px"
      borderRadius: 9999
    - id: ts_caption
      name: 字幕
      role: caption
      fontFamily: "'PingFang SC', 'Noto Sans SC', sans-serif"
      fontSize: 32
      fontWeight: 500
      color: "#ffffff"
      lineHeight: 1.5
      textAlign: center
      backgroundColor: "rgba(0,0,0,0.6)"
      padding: "8px 16px"
      borderRadius: 8

  animationPresets:
    - id: anim_fade_in
      name: 淡入
      type: enter
      animation: fadeIn
      duration: 0.6
      easing: ease-out
    - id: anim_float_up
      name: 上浮出现
      type: enter
      animation: floatUp
      duration: 0.8
      easing: ease-out
    - id: anim_slide_up
      name: 底部上滑
      type: enter
      animation: slideUp
      duration: 0.7
      easing: ease-out
    - id: anim_slide_down
      name: 顶部下滑
      type: enter
      animation: slideDown
      duration: 0.7
      easing: ease-out
    - id: anim_scale_in
      name: 放大弹出
      type: enter
      animation: scaleIn
      duration: 0.5
      easing: cubic-bezier(0.175, 0.885, 0.32, 1.275)
    - id: anim_fade_out
      name: 淡出
      type: exit
      animation: fadeOut
      duration: 0.5
      easing: ease-in

  subtitleStyles:
    - id: sub_bottom
      name: 底部居中
      position: bottom_center
      fontSize: 32
      color: "#ffffff"
      backgroundColor: "rgba(0,0,0,0.6)"
      padding: "8px 16px"
      borderRadius: 8
    - id: sub_yellow
      name: 底部暖黄
      position: bottom_center
      fontSize: 34
      color: "#111111"
      backgroundColor: "#ffb800"
      padding: "10px 20px"
      borderRadius: 9999

  layoutPresets:
    - id: layout_product_hero
      name: 产品主视觉
      type: product_showcase
      elements:
        - type: image
          anchor: center
          x: 50
          y: 42
          width: 720
          height: 720
        - type: text
          anchor: bottom_center
          x: 50
          y: 74
          styleId: ts_title
        - type: text
          anchor: bottom_center
          x: 50
          y: 80
          styleId: ts_subtitle
        - type: text
          anchor: bottom_center
          x: 50
          y: 88
          styleId: ts_price
    - id: layout_avatar_intro
      name: 数字人开场
      type: avatar_talking
      elements:
        - type: avatar
          anchor: center
          x: 50
          y: 45
          width: 900
          height: 900
        - type: text
          anchor: bottom_center
          x: 50
          y: 86
          styleId: ts_caption
    - id: layout_title_card
      name: 大字标题卡
      type: text_overlay
      elements:
        - type: text
          anchor: center
          x: 50
          y: 44
          styleId: ts_title
        - type: text
          anchor: center
          x: 50
          y: 54
          styleId: ts_subtitle
        - type: shape
          anchor: center
          x: 50
          y: 58
          width: 160
          height: 8
    - id: layout_closing
      name: 品牌结尾卡
      type: closing
      elements:
        - type: logo
          anchor: center
          x: 50
          y: 42
          width: 240
          height: 120
        - type: text
          anchor: center
          x: 50
          y: 56
          styleId: ts_title
        - type: text
          anchor: center
          x: 50
          y: 64
          styleId: ts_subtitle

  shapePresets:
    - id: shape_tag
      name: 标签
      shape: tag
      fill: "#ff2e00"
      stroke: "#ffffff"
      strokeWidth: 0
    - id: shape_circle
      name: 圆形装饰
      shape: circle
      fill: "#ff5600"
      stroke: "#ffffff"
      strokeWidth: 4
    - id: shape_arrow
      name: 箭头
      shape: arrow-right
      fill: "#ffb800"
      stroke: "#111111"
      strokeWidth: 0
    - id: shape_star
      name: 星形
      shape: star
      fill: "#ffb800"
      stroke: "#ff5600"
      strokeWidth: 0
    - id: shape_rect
      name: 矩形装饰
      shape: rect
      fill: "#2563eb"
      stroke: "#ffffff"
      strokeWidth: 0
      borderRadius: 16

  elementLibrary:
    - id: lib_badge_hot
      name: 热卖
      type: sticker
      category: badge
      defaultContent: "🔥 热卖"
      defaultStyle:
        fontFamily: "'PingFang SC', 'Noto Sans SC', sans-serif"
        fontSize: 32
        fontWeight: 700
        color: "#ffffff"
        backgroundColor: "#ff2e00"
        padding: "12px 24px"
        borderRadius: 9999
    - id: lib_badge_new
      name: 新品
      type: sticker
      category: badge
      defaultContent: "✨ 新品"
      defaultStyle:
        fontFamily: "'PingFang SC', 'Noto Sans SC', sans-serif"
        fontSize: 32
        fontWeight: 700
        color: "#111111"
        backgroundColor: "#ffb800"
        padding: "12px 24px"
        borderRadius: 9999
    - id: lib_tag_price
      name: 价格标签
      type: text
      category: badge
      defaultContent: "¥99"
      defaultStyle:
        fontFamily: "'PingFang SC', 'Noto Sans SC', sans-serif"
        fontSize: 52
        fontWeight: 700
        color: "#ffffff"
        backgroundColor: "#ff5600"
        padding: "18px 56px"
        borderRadius: 9999
    - id: lib_star
      name: 星星装饰
      type: shape
      category: decoration
      shape: star
      defaultStyle:
        fill: "#ffb800"
    - id: lib_arrow
      name: 箭头指引
      type: shape
      category: decoration
      shape: arrow-right
      defaultStyle:
        fill: "#ff5600"
---

# 分镜与品牌预设库

包含默认的镜头模板、版式预设、文本样式、动画、形状和元素库。
