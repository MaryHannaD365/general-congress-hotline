const path = require('path');

const twilio = require('twilio');

const config = require(path.join(__dirname, '../', process.env.CONFIG));

const congress = require('./congress');
const phoneCall = require('./phone-call');

function switchboard(req, res) {
  console.log('Switchboard', req.body);
  const call = new twilio.TwimlResponse();
  call.gather({
    timeout: 20,
    numDigits: 1,
    action: 'new_phone_call',
    method: 'POST',
  }, function() {
    // Dial 1 for this, dial 2 for that...
    this.play(config.audio.switchboard.intro);
  });
  call.redirect('/error_redirect/switchboard')

  res.status(200);
  res.type('text/xml');
  res.send(call.toString());
}

function newCall(req, res) {
  console.log('Placing new call', req.body);

  let action;
  switch(req.body.Digits) {
    case '1':
      action = 'call_senate';
      break;
    case '2':
      action = 'call_house';
      break;
    default:
      action = 'call_house_and_senate';
  }

  const audioForSelectedAction = config.audio.switchboard.options[req.body.Digits] ||
                                 config.audio.introAndPromptForZip;

  console.log('Chose action:', action);
  console.log('Chose audio:', audioForSelectedAction);

  const call = new twilio.TwimlResponse();
  call.gather({
    timeout: 20,
    finishOnKey: '#',
    numDigits: 5,
    action: action,
    method: 'POST',
  }, function () {
    this.play(audioForSelectedAction);

    if (config.audioOptions.addPromptForZipCode) {
      this.play(config.audio.pleaseEnterZip);
    }
  });
  call.redirect('/error_redirect/switchboard');

  res.status(200);
  res.type('text/xml');
  res.send(call.toString());
}

function callSenate(req, res) {
  console.log('Call Senate', req.body.Digits);
  congress.getPeople(req.body.Digits, (people) => {
    people = people.filter(person => person.chamber === 'senate');
    callPeople(people, res);
  });
}

function callHouse(req, res) {
  console.log('Call House', req.body.Digits);
  congress.getPeople(req.body.Digits, (people) => {
    people = people.filter(person => person.chamber === 'house');
    callPeople(people, res);
  });
}

function callHouseAndSenate(req, res) {
  console.log('Call House and Senate', req.body.Digits);
  congress.getPeople(req.body.Digits, (people) => {
    callPeople(people, res);
  });
}

function callPeople(people, res) {
  console.log('Calling congresspeople', people.length);

  // Construct Twilio response.
  const call = new twilio.TwimlResponse();
  if (!people || people.length < 1) {
    call.redirect('/error_redirect/switchboard');
  } else {
    call.play(config.audio.aboutToStart);
    people.sort(config.target.sortFn).forEach((person, idx) => {
      if (idx > 0) {
        call.play(config.audio.nextCallBeginning);
      }

      const name = `${person.first_name} ${person.last_name}`;
      const phone = person.phone;
      if (person.chamber === 'senate') {
        call.play(config.audio.senator);
      } else {
        call.play(config.audio.representative);
      }
      call.say({ voice: 'woman' }, name);

      phoneCall(call, phone);
    });
    call.play(config.audio.done);
  }

  res.type('text/xml');
  res.status(200);
  res.send(call.toString());
}

function getWrapper(fn, req, res) {
  req.body = req.query;
  return fn(req, res);
}

module.exports = {
  newCall: newCall,
  newCallTestGet: getWrapper.bind(this, newCall),

  callSenate: callSenate,
  callHouse: callHouse,
  callHouseAndSenate: callHouseAndSenate,

  callSenateTestGet: getWrapper.bind(this, callSenate),
  callHouseTestGet: getWrapper.bind(this, callHouse),
  callHouseAndSenateTestGet: getWrapper.bind(this, callHouseAndSenate),

  switchboard: switchboard,
  switchboardTestGet: getWrapper.bind(this, switchboard),
};
