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
  referer: 'https://juejin.cn/',
  accept: '*/*',
  cookie
};

const DRAW_CHANCE = 'https://api.juejin.cn/growth_api/v1/lottery_config/get' // 查询今日是否有免费抽奖机会
const DRAW_LAUNCH = 'https://api.juejin.cn/growth_api/v1/lottery/draw' // 执行免费抽奖
const QUERY_IS_CHECKIN = 'https://api.juejin.cn/growth_api/v1/get_today_status' // 查询今日是否已经签到
const CHECKIN_LAUNCH = 'https://api.juejin.cn/growth_api/v1/check_in' // 执行签到
const QUERY_CURRENT_POINT = 'https://api.juejin.cn/growth_api/v1/get_cur_point' // 查询当前积分

// compose 组合函数
const compose = function (handles) {
  return handles.reduceRight((prev, next) => {
    return prev.then(next)
  }, Promise.resolve())
}

// 发送邮件
function doSendMail(preResult) {
  const { doDrawResult } = preResult;
  const msg = doDrawResult.errorMsg || `签到成功！恭喜抽到：${doDrawResult.lottery_name}`
  const html = `
    <h1 style="text-align: center">自动签到通知</h1>
    <p style="text-indent: 2em">执行结果：${msg}</p>
    <p style="text-indent: 2em">当前积分：${preResult.score}</p>
    ${ doDrawResult.errorObj ? '<p style="text-indent: 2em">' + JSON.stringify(doDrawResult.errorObj) + '</p>' : '' }
  `
  return sendMail({
    from: '掘金',
    to,
    subject: '掘金定时签到',
    html
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
  }).then((res) => res.json()).then(res => ({...preResult, score: res.data}));
}

// 查询当前是否有免费抽奖机会
function queryDrawChance(preResult) {
  return fetch(DRAW_CHANCE, {
    headers,
    method: 'GET',
    credentials: 'include'
  }).then((res) => res.json()).then(res => {
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


compose([
  doSendMail,
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
    doDrawResult: {
      errorMsg: '流水线执行异常',
      score: 0,
      errorObj: err
    }
  })
})
