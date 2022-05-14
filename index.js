const fetch = require('node-fetch');
const sendMail = require('./sendMail');

const [cookie, user, pass, to] = process.argv.slice(2);
process.env.user = user;
process.env.pass = pass;
let score = 0;

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.150 Safari/537.36',
  'accept-encoding': 'gzip, deflate, br',
  'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'sec-ch-ua': '"Chromium";v="88", "Google Chrome";v="88", ";Not A Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  authority: 'api.juejin.cn',
  referer: 'https://juejin.cn/',
  accept: '*/*',
  cookie
};

const DRAW_CHANCE = 'https://api.juejin.cn/growth_api/v1/lottery_config/get' // 查询今日是否有免费抽奖机会
const DRAW_LAUNCH = 'https://api.juejin.cn/growth_api/v1/lottery/draw' // 执行免费抽奖
const QUERY_IS_CHECKIN = 'https://api.juejin.cn/growth_api/v1/get_today_status' // 查询今日是否已经签到
const CHECKIN_LAUNCH = 'https://api.juejin.cn/growth_api/v1/check_in' // 执行签到
const QUERY_CURRENT_POINT = 'https://api.juejin.cn/growth_api/v1/get_cur_point' // 查询当前积分
const QUERY_LUCK_LIST = 'https://api.juejin.cn/growth_api/v1/lottery_history/global_big' // 查询可粘福气列表
const QUERY_MY_LUCK = 'https://api.juejin.cn/growth_api/v1/lottery_lucky/my_lucky' // 查询我的粘福气
const DIP_LUCK = 'https://api.juejin.cn/growth_api/v1/lottery_lucky/dip_lucky' // 粘福气
const NOT_COLLECT_LIST = 'https://api.juejin.cn/user_api/v1/bugfix/not_collect' // 未采集的bug列表
const COLLECT_BUG = 'https://api.juejin.cn/user_api/v1/bugfix/collect' // 采集bug


// compose 组合函数
const compose = function (handles) {
  return handles.reduceRight((prev, next) => {
    return prev.then(next)
  }, Promise.resolve())
}

// 发送邮件
function doSendMail(preResult) {
  const { doDrawResult, dipLuckyResult, isSuccess } = preResult;
  let html = ''
  if (isSuccess) {
    const signMsg = doDrawResult.errorMsg || `签到成功！恭喜抽到：${doDrawResult.lottery_name}`
    const dipLuckMsg = dipLuckyResult.data.has_dip ? '今日已经粘过福气' : `粘福气成功, 幸运值+ ${dipLuckyResult.data.dip_value}`
    html = `
      <h1 style="text-align: center">签到 + 粘福气</h1>
      <p style="text-indent: 2em">签到执行结果：${signMsg}</p>
      <p style="text-indent: 2em">粘福气执行结果：${dipLuckMsg}</p>
      <p style="text-indent: 2em">当前积分：${preResult.score}</p>
      <p style="text-indent: 2em">当前幸运值：${preResult.luckvalue}</p>
      <p style="text-indent: 2em">采集bug数：${preResult.bugs}</p>
    `
  } else {
    html = `
      <h1 style="text-align: center">签到 + 粘福气 失败!!</h1>
      <p style="text-indent: 2em">签到执行结果: 失败</p>
      <p style="text-indent: 2em">失败原因: ${JSON.stringify(doDrawResult.errorObj)}</p>
    `
  }
  return sendMail({
    from: '掘金',
    to,
    subject: '掘金定时签到',
    html
  })
}
// 获取未采集的bug列表
function queryBugList(preResult) {
  return fetch(NOT_COLLECT_LIST, {
    headers,
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({})
  }).then((res) => res.json()).then(res => {
    if (!res.data) throw new Error(res)
    return {...preResult, bugs: res.data}
  })
}
// bug 采集
function collectBug(preResult){
  function generateAction(bug) {
    return fetch(COLLECT_BUG, {
      headers,
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({
        bug_time: bug.bug_time,
        bug_type: bug.bug_type
      })
    }).then((res) => res.json())
  }
  const actions = preResult.bugs.map(bug => generateAction(bug))
  return Promise.all(actions).then(res => {
    return {...preResult, bugs: res.length}
  })
}

// 检查今天是否已签到
function isCheckIn() {
  return fetch(QUERY_IS_CHECKIN, {
    headers,
    method: 'GET',
    credentials: 'include'
  }).then((res) => res.json()).then(res => {
    const errorMsg = res.err_no !== 0 ? '签到失败！' : res.data ? '今日已经签到！' : ''
    return {
      status: !errorMsg,
      errorMsg
    }
  })
}

// 执行今日签到
function doCheckIn(isCheckInResult) {
  const doCheckInResult = {
    status: isCheckInResult.status,
    point: 0,
    errorMsg: isCheckInResult.errorMsg
  }
  if (!isCheckInResult.status) return Promise.resolve({isCheckInResult, doCheckInResult});
  return fetch(CHECKIN_LAUNCH, {
    headers,
    method: 'POST',
    credentials: 'include'
  }).then((res) => res.json()).then(res => {
    if (!res.data) throw new Error(res)
    const errorMsg = res.err_no !== 0 ? '签到异常！' : ''
    return {
      isCheckInResult,
      doCheckInResult: {
        status: !errorMsg,
        point: res.data.sum_point,
        errorMsg
      }
    }
  });
}
// 查询当前的积分
function queryCurrentPoint(preResult) {
  return fetch(QUERY_CURRENT_POINT, {
    headers,
    method: 'GET',
    credentials: 'include'
  }).then((res) => res.json()).then(res => {
    if (!res.data) throw new Error(res)
    return {...preResult, score: res.data}
  });
}

// 查询当前是否有免费抽奖机会
function queryDrawChance(preResult) {
  return fetch(DRAW_CHANCE, {
    headers,
    method: 'GET',
    credentials: 'include'
  }).then((res) => res.json()).then(res => {
    if (!res.data) throw new Error(res)
    const errorMsg = res.err_no !== 0 ? '已经签到！免费抽奖失败！' : res.data.free_count === 0 ? '签到成功！今日已经免费抽奖！' : '';
    return {
      ...preResult,
      drawChanceResult: {
        status: !errorMsg,
        errorMsg
      },
    }
  });
}
// 执行免费抽奖
function doDraw(preResult) {
  const doDrawResult = {
    status: preResult.drawChanceResult.status,
    errorMsg: preResult.drawChanceResult.errorMsg
  }
  if (!preResult.drawChanceResult.status) return Promise.resolve({...preResult, doDrawResult});
  return fetch(DRAW_LAUNCH, {
    headers,
    method: 'POST',
    credentials: 'include'
  }).then((res) => res.json()).then(res => {
    if (!res.data) throw new Error(res)
    const errorMsg = res.err_no !== 0 ? '已经签到！免费抽奖异常！' : ''
    return {
      ...preResult,
      doDrawResult: {
        ...res.data,
        status: !errorMsg,
        errorMsg
      }
    }
  });
}

// 粘福气
function dipLucky(preResult) {
  return fetch(DIP_LUCK, {
    headers,
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({
      lottery_history_id: preResult.luckList[0]
    })
  }).then((res) => res.json()).then(res => {
    if (!res.data) throw new Error(res)
    return { ...preResult, dipLuckyResult: res }
  });
}
// 查询我的福气值
function queryMylucky(preResult) {
  return fetch(QUERY_MY_LUCK, {
    headers,
    method: 'POST',
    credentials: 'include'
  }).then((res) => res.json()).then(res => {
    if (!res.data) throw new Error(res)
    return { ...preResult, luckvalue: res.data.total_value, isSuccess: true }
  })
}
// 查询可粘福气列表
function queryLuckList(preResult) {
  return fetch(QUERY_LUCK_LIST, {
    headers,
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({
      page_no: 1,
      page_size: 5
    })
  }).then((res) => res.json()).then(res => {
    if (!res.data) throw new Error(res)
    const lunks = res.data.lotteries.map(lottiem => lottiem.history_id)
    return {...preResult, luckList: lunks}
  })
}

compose([
  doSendMail,
  collectBug,
  queryBugList,
  queryMylucky,
  dipLucky,
  queryLuckList,
  queryCurrentPoint,
  doDraw,
  queryDrawChance,
  doCheckIn,
  isCheckIn
])
.then(() => console.log('流水线执行成功'))
.catch(err => {
  console.log('执行异常', err)
  doSendMail({
    isSuccess: false,
    doDrawResult: {
      errorMsg: '流水线执行异常',
      score: 0,
      errorObj: err
    }
  })
})
