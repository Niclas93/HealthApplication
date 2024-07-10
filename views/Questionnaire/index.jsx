import { useEffect, useState, useCallback } from 'react';
import Voice from '@react-native-voice/voice';
import TTS from 'react-native-tts';
import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Button, Divider, Text, LinearProgress } from '@rneui/themed';
import QuestionService from '../../services/QuestionService';
import { Temperature } from '../../components/Temperature';
import BleManager from 'react-native-ble-manager';
import { useFocusEffect } from '@react-navigation/native';

const Questionnaire = () => {
  const questionService = new QuestionService();
  const TIME_FOR_LOCK = 1500;

  const QUESTIONNAIRE_STATES = {
    BEFORE_STARTING: 'BEFORE_STARTING',
    STARTED: 'STARTED',
    LOADING: 'LOADING',
    FINISHED: 'FINISHED',
    SAVING: 'SAVING',
    SAVED: 'SAVED',
    TEMPSCAN: 'TEMPSCAN',
    SCAN_HAND_SELECTION: 'SCAN_HAND_SELECTION',
    SCAN_AI_DETECTION: 'SCAN_AI_DETECTION',
    SCAN_FINGER_SELECTION: 'SCAN_FINGER_SELECTION',
    SCAN_TIP_OF_FINGER: 'SCAN_TIP_OF_FINGER',
    SCAN_PROXIMAL_OF_FINGER: 'SCAN_PROXIMAL_OF_FINGER',
    SCAN_ADDITIONAL_FINGER_SELECTION: 'SCAN_ADDITIONAL_FINGER_SELECTION',
    SCAN_ADDITIONAL_HAND_SELECTION: 'SCAN_ADDITIONAL_HAND_SELECTION',
    SCAN_CONFIRMATION: 'SCAN_CONFIRMATION',
  };

  const TTS_STATES = {
    STARTED: 'STARTED',
    FINISHED: 'FINISHED',
    CANCELLED: 'CANCELLED',
  };

  const numbersInWords = {
    one: 1,
    to: 2,
    too: 2,
    two: 2,
    three: 3,
    four: 4,
    for: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
  };

  const VOICE_COMMANDS = {
    PREVIOUS_QUESTION: 'previous question',
    CANCEL_QUESTIONNAIRE: 'cancel questionnaire',
    BEGIN_QUESTIONNAIRE: 'begin',
  };

  // RECORDING
  // const [isRecording, setIsRecording] = useState(false);
  const [isManualNavigation, setIsManualNavigation] = useState(false);

  // VOICE
  const [partialResults, setPartialResults] = useState('');

  // TTS
  const [ttsState, setTtsState] = useState();

  // QUESTIONS
  const [questions, setQuestions] = useState([]);

  // QUESTIONNAIRE STATUS
  const [qStatus, setQStatus] = useState({
    state: QUESTIONNAIRE_STATES.BEFORE_STARTING,
    questionIdx: 0,
    answeredQuestions: [],
    externalData: {},
    lastAnswerSet: 0,
    selectedHand: '',
    selectedFinger: '',
    scanStep: 0,
    scans: [], // Store all scans
  });

  const initializeVoiceHandlers = useCallback(() => {
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechPartialResults;
    Voice.onSpeechError = onSpeechError;
  }, []);

  // Stop the voice recording
  const stopRecording = async () => {
    try {
      await Voice.stop();
    } catch (error) {
      console.error('Error stopping Voice recording', error);
    }
  };

  // Start the voice recording
  const startRecording = async () => {
    try {
      console.log('Start recording called');
      await Voice.start('en-US');
      setTimeout(() => {
        stopRecording();
      }, 5000); // Stop the recording after 5 seconds
    } catch (error) {
      console.error('Error starting Voice recording', error);
    }
  };

  // Stop TTS and Voice
  const stopTTSAndVoice = async () => {
    try {
      await TTS.stop();
    } catch (error) {
      console.log('Error stopping TTS', error);
    }
    try {
      await Voice.stop();
    } catch (error) {
      console.log('Error stopping Voice', error);
    }
    try {
      await Voice.destroy();
    } catch (error) {
      console.log("Error destroying voice", error)
    }
  };

  const cleanupVoice = () => {
    
    TTS.stop().catch(error => console.error('Failed to stop TTS:', error));
    Voice.stop();
    Voice.destroy().catch(error => console.error('Failed to destroy voice:', error));
    Voice.removeAllListeners();
  };

  // VOICE HANDLERS
  const onSpeechStart = (e) => {
    console.log('onSpeechStart: ', e);
  };

  const onSpeechEnd = (e) => {
    console.log('onSpeechEnd: ', e);
  };

  const onSpeechPartialResults = (e) => {
    console.log('onSpeechPartialResults: ', e);
    const milis = new Date().getTime();
    const result = e.value[0].toLowerCase();
    // if (result.includes(VOICE_COMMANDS.PREVIOUS_QUESTION)) {
    //   stopRecording();
    //   goToPreviousQuestion();
    //   console.log("Spracheingabe erfolgt")
    // } else if (result.includes(VOICE_COMMANDS.CANCEL_QUESTIONNAIRE)) {
    //   stopRecording();
    //   cancelQuestionnaire();
    // } else 
    if (result.includes(VOICE_COMMANDS.BEGIN_QUESTIONNAIRE)) {
      stopRecording();
      startQuestionnaire(); // Start the questionnaire if the voice command is recognized
    }
    setPartialResults((prevState) => {
      if (
        prevState &&
        e.value[0] === prevState.results[0] &&
        milis - prevState.collectedAt <= TIME_FOR_LOCK
      ) {
        return prevState;
      }
      if (prevState && milis - prevState.collectedAt <= TIME_FOR_LOCK) {
        const newText = e.value[0];
        const oldText = prevState.results[0];
        if (!oldText || !newText) return prevState;
        const newWords = newText.split(' ');
        const newNumber = newWords[newWords.length - 1].toLowerCase();
        const oldWords = oldText.split(' ');
        const oldNumber = oldWords[oldWords.length - 1].toLowerCase();
        if (
          numbersInWords[newNumber] &&
          numbersInWords[oldNumber] &&
          numbersInWords[newNumber] === numbersInWords[oldNumber]
        ) {
          return prevState;
        }
      }
      console.log('Setting new value: ', e.value);
      return { results: e.value, collectedAt: milis };
    });
  };

  const onSpeechError = (e) => {
    console.log('onSpeechError', e);
  };

  // TTS HANDLERS
  const ttsStartHandler = (e) => {
    console.log('TTS STARTED');
    setTtsState(TTS_STATES.STARTED);
  };

  const ttsFinishHandler = (e) => {
    console.log('TTS FINISHED: ', e);
    setTtsState(TTS_STATES.FINISHED);
  };

  const ttsCancelHandler = (e) => {
    console.log('TTS CANCELLED: ', e);
    setTtsState(TTS_STATES.CANCELLED);
  };

  // Initialization and cleanup logic
  useEffect(() => {
    const init = async () => {
      try {
        const ttsInitStatus = await TTS.getInitStatus();
        if (!ttsInitStatus) {
          throw new Error('TTS initialization Failed');
        }
        TTS.addEventListener('tts-start', ttsStartHandler);
        TTS.addEventListener('tts-finish', ttsFinishHandler);
        TTS.addEventListener('tts-cancel', ttsCancelHandler);
        TTS.setDefaultLanguage('en-US');
      } catch (error) {
        console.log('TTS INITIALIZATION ERROR', error);
      }
      initializeVoiceHandlers();

      try {
        const questions = await questionService.fetchQuestions();
        setQuestions(questions);
      } catch (error) {
        console.log('QUESTION FETCH ERROR', error);
      }
    };
    init();

    return () => {
      if (Platform.OS === 'ios') {
        TTS.removeEventListener('tts-start', ttsStartHandler);
        TTS.removeEventListener('tts-finish', ttsFinishHandler);
        TTS.removeEventListener('tts-cancel', ttsCancelHandler);
      }
      stopTTSAndVoice();
      Voice.destroy().catch((error) =>
        console.log('DESTROYING VOICE FAILED', error)
      );
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      initializeVoiceHandlers();
      startRecording();

      return () => {
        stopTTSAndVoice();
      };
    }, [initializeVoiceHandlers])
  );

  // Fetch weather information based on geolocation
  const getWeather = async (lat, lon) => {
    const weatherResponse = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=0bb2954984e58b4696605e92623b8626`
    );
    const weatherData = await weatherResponse.json();
    return {
      city: weatherData.name,
      country: weatherData.sys.country,
      temperature: (((weatherData.main.temp - 273.15) * 9) / 5 + 32).toFixed(2),
      description: weatherData.weather[0].description,
    };
  };

  // Fetch geolocation
  const fetchGeoLocation = async () => {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition((info, error) => {
        if (error) {
          return reject(error);
        }
        return resolve(info);
      });
    });
  };

  // Get external information (location and weather)
  const getExternalInformation = async () => {
    let location = {},
      weather = {};
    try {
      location = await fetchGeoLocation();
    } catch (ex) {
      console.error('Could not fetch location', ex);
    }

    if (!location) return [location, weather];

    try {
      weather = await getWeather(
        location.coords.latitude,
        location.coords.longitude
      );
    } catch (ex) {
      console.error('could not fetch weather', ex);
    }

    return [location, weather];
  };

  // Navigate to the previous question
  const goToPreviousQuestion = async () => {
    setIsManualNavigation(true);
    try {
      await TTS.stop();
    } catch (error) {
      console.log('Error stopping TTS in goToPreviousQuestion', error);
    }
    console.log("Zur vorherigen Frage gegangen")


    setQStatus((q) => {
      if (q.questionIdx === 0) return q;
      const newIdx = q.questionIdx - 1;
      const updatedAnsweredQuestions = q.answeredQuestions.slice(0, newIdx);
      return {
        ...q,
        questionIdx: newIdx,
        answeredQuestions: updatedAnsweredQuestions,
        state: QUESTIONNAIRE_STATES.STARTED,
      };
    });
  };

  // Navigate to the next question
  const nextQuestion = async () => {
    setIsManualNavigation(true);
    try {
      await TTS.stop();
    } catch (error) {
      console.log('TTS stop failed at next question');
    }
    if (qStatus.questionIdx + 1 >= questions.length) {
      return setQStatus((q) => ({ ...q, state: QUESTIONNAIRE_STATES.SCAN_CONFIRMATION }));
    }
    setQStatus((q) => ({ ...q, questionIdx: q.questionIdx + 1 }));
  };

  // Select an answer for the current question
  const selectAnswer = (answer) => {
    stopRecording().then(
      setQStatus((q) => {
        const lastAnswerSet = new Date().getTime();
        return {
          ...q,
          answeredQuestions: [
            ...q.answeredQuestions,
            {
              questionObj: questions[qStatus.questionIdx],
              patientAnswer: answer,
            },
          ],
          lastAnswerSet,
        };
      })
    );
    setIsManualNavigation(false);
  };

  // Get the choice number from the speech text
  function getChoiceFromSpeech(text) {
    const match = text.match(/choice (\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  // Start the questionnaire
  const startQuestionnaire = () => {
    stopRecording();
    return setQStatus((q) => ({ ...q, state: QUESTIONNAIRE_STATES.STARTED }));
  };

  // Restart the questionnaire
  const restartQuestionnaire = async () => {
    try {
      await stopTTSAndVoice();
    } catch (error) {
      console.error('Error stopping TTS or Voice:', error);
    }

    setQStatus({
      state: QUESTIONNAIRE_STATES.BEFORE_STARTING,
      questionIdx: 0,
      answeredQuestions: [],
      externalData: {},
      scans: [],
    });

    TTS.setDefaultLanguage('en-US');
    initializeVoiceHandlers();

    setTimeout(() => {
      startRecording();
    }, 100);
  };

  // Cancel the questionnaire
  const cancelQuestionnaire = async () => {
    try {
      await stopTTSAndVoice();
    } catch (error) {
      console.error('Error stopping TTS or Voice:', error);
    }

    setQStatus({
      state: QUESTIONNAIRE_STATES.BEFORE_STARTING,
      questionIdx: 0,
      answeredQuestions: [],
      externalData: {},
      scans: [],
    });

    TTS.setDefaultLanguage('en-US');
    initializeVoiceHandlers();

    setTimeout(() => {
      startRecording();
    }, 100);
  };

  // Read the current question and its answers
  const readQuestion = async () => {
    const { question, answers } = questions[qStatus.questionIdx];
    const text =
      'Question ' + (qStatus.questionIdx + 1) + ', ' + question + '; ';
    const ans = answers
      .map((ans, index) => {
        if (qStatus.questionIdx == 0) return index + 1 + ', ' + ans;
        return 'choice ' + (index + 1) + ', ' + ans;
      })
      .join();
    TTS.getInitStatus().then(() => {
      TTS.speak(text + ans);
    });
  };

  // Read the scan confirmation prompt
  const readScanConfirmation = async () => {
    const text = 'Do you want to proceed with the scan?';
    const options = 'choice 1, Yes; choice 2, No;';
    TTS.getInitStatus().then(() => {
      TTS.speak(text + ' ' + options);
    });
  };

  // Read the hand selection prompt
  const readHandSelection = async () => {
    const text = 'Which hand do you want to scan?';
    const options = 'choice 1, Left; choice 2, Right;';
    TTS.getInitStatus().then(() => {
      TTS.speak(text + ' ' + options);
    });
  };

  // Read the AI detection prompt
  const readAIDetection = async () => {
    const text = 'The AI detected, that PLACEHOLDER fingers have symptoms';
    const options = 'choice 1, Yes; choice 2, No;';
    TTS.getInitStatus().then(() => {
      TTS.speak(text + ' ' + options);
    });
  };

  // Read the finger selection prompt
  const readFingerSelection = async () => {
    const text = 'Which finger do you want to scan?';
    const options =
      'choice 1, Thumb; choice 2, Index; choice 3, Middle; choice 4, Ring; choice 5, Pinky;';
    TTS.getInitStatus().then(() => {
      TTS.speak(text + ' ' + options);
    });
  };

  // Read the prompt to scan the tip of the finger
  const readTipOfFinger = async () => {
    const text = 'Please scan the tip of your finger';
    const options = 'Say or press Start;';
    TTS.getInitStatus().then(() => {
      TTS.speak(text + ' ' + options);
    });
  };

  // Read the prompt to scan the proximal of the finger
  const readProximalOfFinger = async () => {
    const text = 'Please scan the proximal of your finger';
    const options = 'Say or press Start;';
    TTS.getInitStatus().then(() => {
      TTS.speak(text + ' ' + options);
    });
  };

  // Read the prompt to scan an additional finger
  const readAdditionalFingerSelection = async () => {
    const text = 'Do you want to scan another Finger?';
    const options = 'choice 1, Yes; choice 2, No;';
    TTS.getInitStatus().then(() => {
      TTS.speak(text + ' ' + options);
    });
  };

  // Read the prompt to scan an additional hand
  const readAdditionalHandSelection = async () => {
    const text = 'Do you want to scan another Hand?';
    const options = 'choice 1, Yes; choice 2, No;';
    TTS.getInitStatus().then(() => {
      TTS.speak(text + ' ' + options);
    });
  };

  // Save the questionnaire data
  const saveData = async () => {
    const history = await AsyncStorage.getItem('history');
    const newHistory = history ? JSON.parse(history) : [];
    const newRecord = {
      answeredQuestions: qStatus.answeredQuestions,
      externalData: qStatus.externalData,
      scans: qStatus.scans,
    };
    if (newHistory.length >= 50) {
      Alert.alert(
        'File Limit Reached',
        'You have reached the limit of stored records. If you save this data, the oldest record will be deleted.',
        [
          {
            text: 'Ok',
            onPress: async () => {
              setQStatus((q) => ({ ...q, state: QUESTIONNAIRE_STATES.SAVING }));
              newHistory.shift();
              newHistory.push(newRecord);
              await AsyncStorage.setItem('history', JSON.stringify(newHistory));
              setQStatus((q) => ({ ...q, state: QUESTIONNAIRE_STATES.SAVED }));
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } else {
      setQStatus((q) => ({ ...q, state: QUESTIONNAIRE_STATES.SAVING }));
      newHistory.push(newRecord);
      await AsyncStorage.setItem('history', JSON.stringify(newHistory));
      setQStatus((q) => ({ ...q, state: QUESTIONNAIRE_STATES.SAVED }));
    }
  };

  // Handle changes in answered questions
  useEffect(() => {
    if (qStatus.state === QUESTIONNAIRE_STATES.BEFORE_STARTING || isManualNavigation) {
      setIsManualNavigation(false);
      return;
    }
    nextQuestion();
  }, [qStatus.answeredQuestions]);

  // Read the question on index update
  useEffect(() => {
    if (qStatus.state !== QUESTIONNAIRE_STATES.STARTED) return;
    readQuestion();
  }, [qStatus.questionIdx]);

  // Handle partial result changes
  useEffect(() => {
    console.log('FIRED');
    if (qStatus.state === QUESTIONNAIRE_STATES.BEFORE_STARTING) return;

    const text = partialResults.results[0];
    if (!text) return;
    console.log('Recognized text:', text);
    const lowercaseText = text.toLowerCase();

    if (qStatus.state === QUESTIONNAIRE_STATES.SCAN_CONFIRMATION) {
      const choiceNumber = getChoiceFromSpeech(lowercaseText);
      if (choiceNumber && choiceNumber <= 2) {
        handleScanConfirmation(['Yes', 'No'][choiceNumber - 1]);
        return;
      }

      const words = lowercaseText.split(' ');
      const number = words[words.length - 1];
      if (numbersInWords[number] && numbersInWords[number] <= 2) {
        handleScanConfirmation(['Yes', 'No'][numbersInWords[number] - 1]);
        return;
      }

      if (lowercaseText.includes('yes')) {
        handleScanConfirmation('Yes');
        return;
      }

      if (lowercaseText.includes('no')) {
        handleScanConfirmation('No');
        return;
      }
      return;
    }

    if (qStatus.state === QUESTIONNAIRE_STATES.SCAN_HAND_SELECTION) {
      const choiceNumber = getChoiceFromSpeech(lowercaseText);
      if (choiceNumber && choiceNumber <= 2) {
        handleHandSelection(['Left', 'Right'][choiceNumber - 1]);
        return;
      }

      const words = lowercaseText.split(' ');
      const number = words[words.length - 1];
      if (numbersInWords[number] && numbersInWords[number] <= 2) {
        handleHandSelection(['Left', 'Right'][numbersInWords[number] - 1]);
        return;
      }

      if (lowercaseText.includes('left')) {
        handleHandSelection('Left');
        return;
      }

      if (lowercaseText.includes('right')) {
        handleHandSelection('Right');
        return;
      }
      return;
    }

    if (qStatus.state === QUESTIONNAIRE_STATES.SCAN_AI_DETECTION) {
      const choiceNumber = getChoiceFromSpeech(lowercaseText);
      if (choiceNumber && choiceNumber <= 2) {
        handleAIDetection(['Yes', 'No'][choiceNumber - 1]);
        return;
      }

      const words = lowercaseText.split(' ');
      const number = words[words.length - 1];
      if (numbersInWords[number] && numbersInWords[number] <= 2) {
        handleAIDetection(['Yes', 'No'][numbersInWords[number] - 1]);
        return;
      }

      if (lowercaseText.includes('yes')) {
        handleAIDetection('Yes');
        return;
      }

      if (lowercaseText.includes('no')) {
        handleAIDetection('No');
        return;
      }
      return;
    }

    if (qStatus.state === QUESTIONNAIRE_STATES.SCAN_FINGER_SELECTION) {
      const choiceNumber = getChoiceFromSpeech(lowercaseText);
      if (choiceNumber && choiceNumber <= 5) {
        handleFingerSelection([
          'Thumb',
          'Index',
          'Middle',
          'Ring',
          'Pinky',
        ][choiceNumber - 1]);
        return;
      }

      const words = lowercaseText.split(' ');
      const number = words[words.length - 1];
      if (numbersInWords[number] && numbersInWords[number] <= 5) {
        handleFingerSelection([
          'Thumb',
          'Index',
          'Middle',
          'Ring',
          'Pinky',
        ][numbersInWords[number] - 1]);
        return;
      }

      if (lowercaseText.includes('thumb')) {
        handleFingerSelection('Thumb');
        return;
      }

      if (lowercaseText.includes('index')) {
        handleFingerSelection('Index');
        return;
      }

      if (lowercaseText.includes('middle')) {
        handleFingerSelection('Middle');
        return;
      }

      if (lowercaseText.includes('ring')) {
        handleFingerSelection('Ring');
        return;
      }

      if (lowercaseText.includes('pinky')) {
        handleFingerSelection('Pinky');
        return;
      }
      return;
    }

    if (lowercaseText.includes(VOICE_COMMANDS.PREVIOUS_QUESTION)) {
      stopRecording();
      goToPreviousQuestion();
      console.log("Spracheingabe erfolgt")
    } else if (lowercaseText.includes(VOICE_COMMANDS.CANCEL_QUESTIONNAIRE)) {
      stopRecording();
      cancelQuestionnaire();
    } 
    // else if (lowercaseText.includes(VOICE_COMMANDS.BEGIN_QUESTIONNAIRE)) {
    //   stopRecording();
    //   startQuestionnaire(); // Start the questionnaire if the voice command is recognized
    // }

    if (
      qStatus.state === QUESTIONNAIRE_STATES.SCAN_TIP_OF_FINGER ||
      qStatus.state === QUESTIONNAIRE_STATES.SCAN_PROXIMAL_OF_FINGER
    ) {
      if (lowercaseText.includes('start')) {
        if (qStatus.state === QUESTIONNAIRE_STATES.SCAN_TIP_OF_FINGER) {
          handleScanTipOfFinger('Start');
        } else {
          handleScanProximalOfFinger('Start');
        }
        return;
      }
      return;
    }

    if (qStatus.state ===
        QUESTIONNAIRE_STATES.SCAN_ADDITIONAL_FINGER_SELECTION) {
      const choiceNumber = getChoiceFromSpeech(lowercaseText);
      if (choiceNumber && choiceNumber <= 2) {
        handleAdditionalFingerSelection(['Yes', 'No'][choiceNumber - 1]);
        return;
      }

      const words = lowercaseText.split(' ');
      const number = words[words.length - 1];
      if (numbersInWords[number] && numbersInWords[number] <= 2) {
        handleAdditionalFingerSelection(['Yes', 'No'][numbersInWords[number] - 1]);
        return;
      }

      if (lowercaseText.includes('yes')) {
        handleAdditionalFingerSelection('Yes');
        return;
      }

      if (lowercaseText.includes('no')) {
        handleAdditionalFingerSelection('No');
        return;
      }
      return;
    }

    if (qStatus.state === QUESTIONNAIRE_STATES.SCAN_ADDITIONAL_HAND_SELECTION) {
      const choiceNumber = getChoiceFromSpeech(lowercaseText);
      if (choiceNumber && choiceNumber <= 2) {
        handleAdditionalHandSelection(['Yes', 'No'][choiceNumber - 1]);
        return;
      }

      const words = lowercaseText.split(' ');
      const number = words[words.length - 1];
      if (numbersInWords[number] && numbersInWords[number] <= 2) {
        handleAdditionalHandSelection(['Yes', 'No'][numbersInWords[number] - 1]);
        return;
      }

      if (lowercaseText.includes('yes')) {
        handleAdditionalHandSelection('Yes');
        return;
      }

      if (lowercaseText.includes('no')) {
        handleAdditionalHandSelection('No');
        return;
      }
      return;
    }

    const { answers } = questions[qStatus.questionIdx];

    const choiceNumber = getChoiceFromSpeech(lowercaseText);
    if (choiceNumber && choiceNumber <= answers.length) {
      selectAnswer(answers[choiceNumber - 1]);
      return;
    }

    const words = lowercaseText.split(' ');
    const number = words[words.length - 1];
    if (numbersInWords[number] && numbersInWords[number] <= answers.length) {
      selectAnswer(answers[numbersInWords[number] - 1]);
    } else {
      for (const text of partialResults.results) {
        for (const answ of answers) {
          if (text.toLowerCase().includes(answ.toLowerCase())) {
            selectAnswer(answ);
            return;
          }
        }
      }
    }
  }, [partialResults.results]);

  // Handle questionnaire state change
  useEffect(() => {
    if (qStatus.state == QUESTIONNAIRE_STATES.STARTED) {
      if (qStatus.questionIdx === 0) readQuestion();
    }

    if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_CONFIRMATION) {
      readScanConfirmation();
    }

    if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_HAND_SELECTION) {
      readHandSelection();
    }

    if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_AI_DETECTION) {
      readAIDetection();
    }

    if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_FINGER_SELECTION) {
      readFingerSelection();
    }

    if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_TIP_OF_FINGER) {
      readTipOfFinger();
    }
    if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_PROXIMAL_OF_FINGER) {
      readProximalOfFinger();
    }
    if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_ADDITIONAL_FINGER_SELECTION) {
      readAdditionalFingerSelection();
    }
    if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_ADDITIONAL_HAND_SELECTION) {
      readAdditionalHandSelection();
    }

    if (qStatus.state == QUESTIONNAIRE_STATES.LOADING) {
      getExternalInformation().then((information) => {
        const [location, weather] = information;
        const timestamp = new Date();
        stopRecording();
        stopTTSAndVoice();
        setQStatus((q) => ({
          ...q,
          externalData: {
            timestampLocale: timestamp.toLocaleString(),
            timestampUTC: timestamp.toISOString(),
            weather: weather,
            location: location,
          },
          state: QUESTIONNAIRE_STATES.FINISHED,
        }));
      });
    }
  }, [qStatus.state]);

  // Handle TTS state change
  useEffect(() => {
    if (ttsState === TTS_STATES.FINISHED) {
      const time = new Date().getTime();
      if (time - qStatus.lastAnswerSet <= TIME_FOR_LOCK) return;
      startRecording();
    }
    if (ttsState === TTS_STATES.CANCELLED) {
      try {
        stopRecording();
      } catch (error) {
        console.log('STOP RECORDING FAILED AT TTS STATE');
      }
    }
  }, [ttsState]);

  // Handle scan confirmation
  const handleScanConfirmation = (choice) => {
    if (choice == 'Yes') {
      stopTTSAndVoice().then(
        setQStatus((q) => {
          const lastAnswerSet = new Date().getTime();
          return {
            ...q,
            state: QUESTIONNAIRE_STATES.SCAN_HAND_SELECTION,
            lastAnswerSet,
          };
        })
      );
    } else {
      cleanupVoice();
      stopTTSAndVoice().then(
        setQStatus((q) => {
          const lastAnswerSet = new Date().getTime();
          return {
            ...q,
            state: QUESTIONNAIRE_STATES.LOADING,
            lastAnswerSet,
          };
        })
      );
    }
  };

  // Handle hand selection
  const handleHandSelection = (choice) => {
    stopTTSAndVoice().then(
      setQStatus((q) => {
        const lastAnswerSet = new Date().getTime();
        return {
          ...q,
          selectedHand: choice,
          scanStep: 0,
          state: QUESTIONNAIRE_STATES.TEMPSCAN,
          // state: QUESTIONNAIRE_STATES.SCAN_AI_DETECTION,
          lastAnswerSet,
        }
      })
    );
  };

  // Handle AI detection
  const handleAIDetection = (choice) => {
    stopTTSAndVoice().then(
      setQStatus((q) => {
        const lastAnswerSet = new Date().getTime();
        return {
          ...q,
          state: QUESTIONNAIRE_STATES.SCAN_FINGER_SELECTION,
          lastAnswerSet,
        }
      })
    );
  };

  // Handle finger selection
  const handleFingerSelection = (choice) => {
    stopTTSAndVoice().then(
      setQStatus((q) => {
        const lastAnswerSet = new Date().getTime();
        return {
          ...q,
          selectedFinger: choice,
          scanStep: 1,
          state: QUESTIONNAIRE_STATES.SCAN_TIP_OF_FINGER,
          lastAnswerSet,
        }
      })
    );
  };

  // Handle scan of the tip of the finger
  const handleScanTipOfFinger = (choice) => {
    stopTTSAndVoice().then(
      setQStatus((q) => {
        const lastAnswerSet = new Date().getTime();
        return {
          ...q,
          scanStep: 2,
          state: QUESTIONNAIRE_STATES.TEMPSCAN,
          // state: QUESTIONNAIRE_STATES.SCAN_PROXIMAL_OF_FINGER,
          lastAnswerSet,
        }
      })
    );
  };

  // Handle scan of the proximal of the finger
  const handleScanProximalOfFinger = (choice) => {
    stopTTSAndVoice().then(
      setQStatus((q) => {
        const lastAnswerSet = new Date().getTime();
        return {
          ...q,
          scanStep: 3,
          state: QUESTIONNAIRE_STATES.TEMPSCAN,
          // state: QUESTIONNAIRE_STATES.SCAN_ADDITIONAL_FINGER_SELECTION,
          lastAnswerSet,
        }
      })
    );
  };

  // Handle additional finger selection
  const handleAdditionalFingerSelection = (choice) => {
    if (choice == 'Yes') {
      stopTTSAndVoice().then(
        setQStatus((q) => {
          const lastAnswerSet = new Date().getTime();
          return {
            ...q,
            state: QUESTIONNAIRE_STATES.SCAN_FINGER_SELECTION,
            lastAnswerSet,
          }
        })
      );
    } else {
      stopTTSAndVoice().then(
        setQStatus((q) => {
          const lastAnswerSet = new Date().getTime();
          return {
            ...q,
            state: QUESTIONNAIRE_STATES.SCAN_ADDITIONAL_HAND_SELECTION,
            lastAnswerSet,
          }
        })
      );
    }
  };

  // Handle additional hand selection
  const handleAdditionalHandSelection = (choice) => {
    if (choice == 'Yes') {
      stopTTSAndVoice().then(
        setQStatus((q) => {
          const lastAnswerSet = new Date().getTime();
          return {
            ...q,
            state: QUESTIONNAIRE_STATES.SCAN_HAND_SELECTION,
            selectedHand: '',
            selectedFinger: '',
            scanStep: 0,
            lastAnswerSet,
          }
        })
      );
    } else {
      cleanupVoice();
      stopTTSAndVoice().then(
        setQStatus((q) => {
          const lastAnswerSet = new Date().getTime();
          return {
            ...q,
            state: QUESTIONNAIRE_STATES.LOADING,
            lastAnswerSet,
          }
        })
      );
    }
  };

  // Calculate average temperature
  const calculateAverageTemperature = (data) => {
    const flattenedData = data.flat();
    const sum = flattenedData.reduce((acc, val) => acc + val, 0);
    return (sum / flattenedData.length).toFixed(2);
  };

  // UI logic and rendering

  if (qStatus.state == QUESTIONNAIRE_STATES.BEFORE_STARTING) {
    return (
      <View style={styles.containerStart}>
        <View style={styles.constainerInstructions}>
          <Text
            h3
            style={{
              marginBottom: 10,
              color: '#4388d6',
            }}
          >
            Instructions
          </Text>
          <Text style={{ marginBottom: 5, fontSize: 16 }}>
            The Questionnaire consists of multiple multi-choice questions.
          </Text>
          <Text style={{ marginBottom: 5, fontSize: 16 }}>
            If you are using an Android phone with the device's voice access on
            please TURN VOICE ACCESS OFF while completing the questionnaire.
          </Text>
          <Text style={{ marginBottom: 5, fontSize: 16 }}>
            You can answer each question by speaking the answer in full or by
            saying "choice" and then the number associated with the answer. The
            questionnaire can also be completed by manually selecting the
            answers.
          </Text>
          <Text style={{ marginBottom: 5, fontSize: 16 }}>
            After going though the questionnaire you can save your answers and
            view them in the history page or restart the questionnaire from the
            beginning.
          </Text>

          <Text style={{ fontSize: 16 }}>
            Press the{' '}
            <Text style={{ color: '#4388d6' }}>blue</Text> button below to
            start the questionnaire
          </Text>
        </View>
        <View>
          <Button
            title='Begin'
            size='lg'
            titleStyle={{
              color: 'white',
              fontSize: 25,
              fontWeight: 'bold',
            }}
            containerStyle={{
              borderRadius: 30,
              width: 300,
            }}
            onPress={startQuestionnaire}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.STARTED) {
    return (
      <View style={styles.containerQuestionnaire}>
        <View style={styles.containerQuestion}>
          <Text
            h3
            style={{
              marginBottom: 10,
              color: '#4388d6',
            }}
          >
            Question {qStatus.questionIdx + 1}
          </Text>
          <Text style={{ fontSize: 20 }}>
            {questions[qStatus.questionIdx].question}
          </Text>
        </View>
        <View accessible={Platform.OS === 'android' ? true : false}>
          {questions[qStatus.questionIdx].answers.map((ans, answerIndex) => {
            return (
              <Button
                title={`${answerIndex + 1}.   ${ans}`}
                accessible={Platform.OS === 'android' ? true : false}
                accessibilityLabelledBy={answerIndex + 1}
                titleStyle={{
                  color: 'white',
                  fontSize: 25,
                  fontWeight: 'bold',
                }}
                containerStyle={{
                  borderRadius: 10,
                  width: 300,
                  marginBottom: 10,
                }}
                key={`${questions[qStatus.questionIdx].id}-${ans}`}
                onPress={() => {
                  stopRecording();
                  selectAnswer(ans);
                }}
              />
            );
          })}
        </View>

        {qStatus.questionIdx > 0 && (
          <View style={{ marginTop: 10 }}>
            <Button
              title='Previous Question'
              buttonStyle={{
                borderWidth: 1,
                borderColor: '#4388d6',
                borderRadius: 10,
                backgroundColor: '#ffffff',
              }}
              titleStyle={{
                color: '#4388d6',
                fontSize: 20,
              }}
              onPress={() => {
                stopRecording();
                goToPreviousQuestion();
              }}
            />
          </View>
        )}
        <View style={{ marginTop: 20 }}>
          <Button
            title='Cancel Questionnaire'
            buttonStyle={{
              borderWidth: 1,
              borderColor: '#ff0000',
              borderRadius: 10,
              backgroundColor: '#ffffff',
            }}
            titleStyle={{
              color: '#ff0000',
              fontSize: 20,
            }}
            onPress={() => {
              stopRecording();
              cancelQuestionnaire();
            }}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_CONFIRMATION) {
    return (
      <View style={styles.containerQuestionnaire}>
        <View style={styles.containerQuestion}>
          <Text
            h3
            style={{
              marginBottom: 10,
              color: '#4388d6',
            }}
          >
            Do you want to proceed with the scan?
          </Text>
        </View>
        <View accessible={Platform.OS === 'android' ? true : false}>
          {['Yes', 'No'].map((option, index) => {
            return (
              <Button
                title={`${index + 1}. ${option}`}
                accessible={Platform.OS === 'android' ? true : false}
                accessibilityLabelledBy={index + 1}
                titleStyle={{
                  color: 'white',
                  fontSize: 25,
                  fontWeight: 'bold',
                }}
                containerStyle={{
                  borderRadius: 10,
                  width: 300,
                  marginBottom: 10,
                }}
                key={option}
                onPress={() => {
                  stopRecording();
                  handleScanConfirmation(option);
                }}
              />
            );
          })}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button
            title='Cancel Questionnaire'
            buttonStyle={{
              borderWidth: 1,
              borderColor: '#ff0000',
              borderRadius: 10,
              backgroundColor: '#ffffff',
            }}
            titleStyle={{ color: '#ff0000', fontSize: 20 }}
            onPress={() => {
              stopRecording();
              cancelQuestionnaire();
            }}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_HAND_SELECTION) {
    return (
      <View style={styles.containerQuestionnaire}>
        <View style={styles.containerQuestion}>
          <Text
            h3
            style={{
              marginBottom: 10,
              color: '#4388d6',
            }}
          >
            Which hand do you want to scan?
          </Text>
        </View>
        <View accessible={Platform.OS === 'android' ? true : false}>
          {['Left', 'Right'].map((option, index) => {
            return (
              <Button
                title={`${index + 1}. ${option}`}
                accessible={Platform.OS === 'android' ? true : false}
                accessibilityLabelledBy={index + 1}
                titleStyle={{
                  color: 'white',
                  fontSize: 25,
                  fontWeight: 'bold',
                }}
                containerStyle={{
                  borderRadius: 10,
                  width: 300,
                  marginBottom: 10,
                }}
                key={option}
                onPress={() => {
                  stopRecording();
                  handleHandSelection(option);
                }}
              />
            );
          })}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button
            title='Cancel Questionnaire'
            buttonStyle={{
              borderWidth: 1,
              borderColor: '#ff0000',
              borderRadius: 10,
              backgroundColor: '#ffffff',
            }}
            titleStyle={{ color: '#ff0000', fontSize: 20 }}
            onPress={() => {
              stopRecording();
              cancelQuestionnaire();
            }}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_AI_DETECTION) {
    return (
      <View style={styles.containerQuestionnaire}>
        <View style={styles.containerQuestion}>
          <Text h3 style={{ marginBottom: 10, color: '#4388d6' }}>
            The AI detected that PLACEHOLDER fingers have symptoms
          </Text>
        </View>
        <View accessible={Platform.OS === 'android' ? true : false}>
          {['Yes', 'No'].map((option, index) => (
            <Button
              title={`${index + 1}. ${option}`}
              accessible={Platform.OS === 'android' ? true : false}
              accessibilityLabelledBy={index + 1}
              titleStyle={{ color: 'white', fontSize: 25, fontWeight: 'bold' }}
              containerStyle={{
                borderRadius: 10,
                width: 300,
                marginBottom: 10,
              }}
              key={option}
              onPress={() => {
                stopRecording();
                handleAIDetection(option);
              }}
            />
          ))}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button
            title='Cancel Questionnaire'
            buttonStyle={{
              borderWidth: 1,
              borderColor: '#ff0000',
              borderRadius: 10,
              backgroundColor: '#ffffff',
            }}
            titleStyle={{ color: '#ff0000', fontSize: 20 }}
            onPress={() => {
              stopRecording();
              cancelQuestionnaire();
            }}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_FINGER_SELECTION) {
    return (
      <View style={styles.containerQuestionnaire}>
        <View style={styles.containerQuestion}>
          <Text
            h3
            style={{
              marginBottom: 10,
              color: '#4388d6',
            }}
          >
            Which finger do you want to scan?
          </Text>
        </View>
        <View accessible={Platform.OS === 'android' ? true : false}>
          {['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].map((option, index) => {
            return (
              <Button
                title={`${index + 1}. ${option}`}
                accessible={Platform.OS === 'android' ? true : false}
                accessibilityLabelledBy={index + 1}
                titleStyle={{
                  color: 'white',
                  fontSize: 25,
                  fontWeight: 'bold',
                }}
                containerStyle={{
                  borderRadius: 10,
                  width: 300,
                  marginBottom: 10,
                }}
                key={option}
                onPress={() => {
                  stopRecording();
                  handleFingerSelection(option);
                }}
              />
            );
          })}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button
            title='Cancel Questionnaire'
            buttonStyle={{
              borderWidth: 1,
              borderColor: '#ff0000',
              borderRadius: 10,
              backgroundColor: '#ffffff',
            }}
            titleStyle={{ color: '#ff0000', fontSize: 20 }}
            onPress={() => {
              stopRecording();
              cancelQuestionnaire();
            }}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_TIP_OF_FINGER) {
    return (
      <View style={styles.containerQuestionnaire}>
        <View style={styles.containerQuestion}>
          <Text
            h3
            style={{
              marginBottom: 10,
              color: '#4388d6',
            }}
          >
            Please scan the tip of your finger
          </Text>
        </View>
        <View accessible={Platform.OS === 'android' ? true : false}>
          {['Start'].map((option, index) => {
            return (
              <Button
                title={`${index + 1}. ${option}`}
                accessible={Platform.OS === 'android' ? true : false}
                accessibilityLabelledBy={index + 1}
                titleStyle={{
                  color: 'white',
                  fontSize: 25,
                  fontWeight: 'bold',
                }}
                containerStyle={{
                  borderRadius: 10,
                  width: 300,
                  marginBottom: 10,
                }}
                key={option}
                onPress={() => {
                  stopRecording();
                  handleScanTipOfFinger(option);
                }}
              />
            );
          })}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button
            title='Cancel Questionnaire'
            buttonStyle={{
              borderWidth: 1,
              borderColor: '#ff0000',
              borderRadius: 10,
              backgroundColor: '#ffffff',
            }}
            titleStyle={{ color: '#ff0000', fontSize: 20 }}
            onPress={() => {
              stopRecording();
              cancelQuestionnaire();
            }}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_PROXIMAL_OF_FINGER) {
    return (
      <View style={styles.containerQuestionnaire}>
        <View style={styles.containerQuestion}>
          <Text
            h3
            style={{
              marginBottom: 10,
              color: '#4388d6',
            }}
          >
            Please scan the proximal of your finger
          </Text>
        </View>
        <View accessible={Platform.OS === 'android' ? true : false}>
          {['Start'].map((option, index) => {
            return (
              <Button
                title={`${index + 1}. ${option}`}
                accessible={Platform.OS === 'android' ? true : false}
                accessibilityLabelledBy={index + 1}
                titleStyle={{
                  color: 'white',
                  fontSize: 25,
                  fontWeight: 'bold',
                }}
                containerStyle={{
                  borderRadius: 10,
                  width: 300,
                  marginBottom: 10,
                }}
                key={option}
                onPress={() => {
                  stopRecording();
                  handleScanProximalOfFinger(option);
                }}
              />
            );
          })}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button
            title='Cancel Questionnaire'
            buttonStyle={{
              borderWidth: 1,
              borderColor: '#ff0000',
              borderRadius: 10,
              backgroundColor: '#ffffff',
            }}
            titleStyle={{ color: '#ff0000', fontSize: 20 }}
            onPress={() => {
              stopRecording();
              cancelQuestionnaire();
            }}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_ADDITIONAL_FINGER_SELECTION) {
    return (
      <View style={styles.containerQuestionnaire}>
        <View style={styles.containerQuestion}>
          <Text h3 style={{ marginBottom: 10, color: '#4388d6' }}>
            Do you want to scan another Finger?
          </Text>
        </View>
        <View accessible={Platform.OS === 'android' ? true : false}>
          {['Yes', 'No'].map((option, index) => (
            <Button
              title={`${index + 1}. ${option}`}
              accessible={Platform.OS === 'android' ? true : false}
              accessibilityLabelledBy={index + 1}
              titleStyle={{ color: 'white', fontSize: 25, fontWeight: 'bold' }}
              containerStyle={{
                borderRadius: 10,
                width: 300,
                marginBottom: 10,
              }}
              key={option}
              onPress={() => {
                stopRecording();
                handleAdditionalFingerSelection(option);
              }}
            />
          ))}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button
            title='Cancel Questionnaire'
            buttonStyle={{
              borderWidth: 1,
              borderColor: '#ff0000',
              borderRadius: 10,
              backgroundColor: '#ffffff',
            }}
            titleStyle={{ color: '#ff0000', fontSize: 20 }}
            onPress={() => {
              stopRecording();
              cancelQuestionnaire();
            }}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SCAN_ADDITIONAL_HAND_SELECTION) {
    return (
      <View style={styles.containerQuestionnaire}>
        <View style={styles.containerQuestion}>
          <Text h3 style={{ marginBottom: 10, color: '#4388d6' }}>
            Do you want to scan another Hand?
          </Text>
        </View>
        <View accessible={Platform.OS === 'android' ? true : false}>
          {['Yes', 'No'].map((option, index) => (
            <Button
              title={`${index + 1}. ${option}`}
              accessible={Platform.OS === 'android' ? true : false}
              accessibilityLabelledBy={index + 1}
              titleStyle={{ color: 'white', fontSize: 25, fontWeight: 'bold' }}
              containerStyle={{
                borderRadius: 10,
                width: 300,
                marginBottom: 10,
              }}
              key={option}
              onPress={() => {
                stopRecording();
                handleAdditionalHandSelection(option);
              }}
            />
          ))}
        </View>
        <View style={{ marginTop: 20 }}>
          <Button
            title='Cancel Questionnaire'
            buttonStyle={{
              borderWidth: 1,
              borderColor: '#ff0000',
              borderRadius: 10,
              backgroundColor: '#ffffff',
            }}
            titleStyle={{ color: '#ff0000', fontSize: 20 }}
            onPress={() => {
              stopRecording();
              cancelQuestionnaire();
            }}
          />
        </View>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.LOADING) {
    if (qStatus.questionIdx != 0 && qStatus.questionIdx + 1 === questions.length) {
      return (
        <View style={styles.containerResults}>
          <Text h3 style={{ color: '#4388d6', marginBottom: 12 }}>
            Collecting Results...
          </Text>
          <LinearProgress
            color='primary'
            animation={{ duration: 700 }}
            value={1}
          />
        </View>
      );
    }
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SAVING) {
    return (
      <View style={styles.containerResults}>
        <Text h3 style={{ color: '#4388d6', marginBottom: 12 }}>
          Saving...
        </Text>
        <LinearProgress color='primary' animation={{ duration: 700 }} value={1} />
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.SAVED) {
    return (
      <View style={styles.containerSaved}>
        <Text style={{ color: '#4ec747', fontSize: 50 }}>Saved</Text>
      </View>
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.TEMPSCAN) {
    return (
      <Temperature
        onContinue={(savedScans) => {
          stopRecording();
          setQStatus((q) => {
            const updatedScans = [...q.scans, ...savedScans];
            const lastAnswerSet = new Date().getTime();
            return {
              ...q,
              scans: updatedScans,
              state:
                q.scanStep === 0
                  ? QUESTIONNAIRE_STATES.SCAN_FINGER_SELECTION
                  : q.scanStep === 1
                  ? QUESTIONNAIRE_STATES.SCAN_FINGER_SELECTION
                  : q.scanStep === 2
                  ? QUESTIONNAIRE_STATES.SCAN_PROXIMAL_OF_FINGER
                  : q.scanStep === 3
                  ? QUESTIONNAIRE_STATES.SCAN_ADDITIONAL_FINGER_SELECTION
                  : QUESTIONNAIRE_STATES.FINISHED,
              lastAnswerSet,
            };
          });
        }}
        selectedHand={qStatus.selectedHand}
        selectedFinger={qStatus.selectedFinger}
        scanStep={qStatus.scanStep}
      />
    );
  }

  if (qStatus.state == QUESTIONNAIRE_STATES.FINISHED) {
    return (
      <ScrollView>
        <View style={styles.containerResults}>
          <View>
            <View style={{ marginBottom: 15 }}>
              <Text style={{ fontSize: 20, color: '#4388d6' }}>
                {' '}
                Timestamp:{' '}
                <Text style={{ fontSize: 15 }}>
                  {qStatus.externalData.timestampLocale}
                </Text>
              </Text>
            </View>
            <View style={{ marginBottom: 15 }}>
              <Text style={{ fontSize: 20, color: '#4388d6' }}>
                {' '}
                Location:{' '}
                <Text style={{ fontSize: 15 }}>
                  {qStatus.externalData.weather.city},{' '}
                  {qStatus.externalData.weather.country}
                </Text>
              </Text>
            </View>
            <View style={{ marginBottom: 15 }}>
              <Text style={{ fontSize: 20, color: '#4388d6' }}>
                {' '}
                Weather:{' '}
                <Text style={{ fontSize: 15, textTransform: 'capitalize' }}>
                  {qStatus.externalData.weather.description}{' '}
                </Text>
              </Text>
            </View>
            <View style={{ marginBottom: 15 }}>
              <Text style={{ fontSize: 20, color: '#4388d6' }}>
                {' '}
                Temperature:{' '}
                <Text style={{ fontSize: 15 }}>
                  {' '}
                  {qStatus.externalData.weather.temperature} °F{' '}
                </Text>
              </Text>
            </View>
          </View>

          {qStatus.answeredQuestions.map((q, qIdx) => {
            return (
              <View key={`${q.questionObj.question}-${q.patientAnswer}`}>
                <View style={{ marginBottom: 15 }}>
                  <Text h3 style={{ color: '#4388d6', marginBottom: 12 }}>
                    Question {qIdx + 1}
                  </Text>
                  <Text style={{ fontSize: 20, marginBottom: 5 }}>
                    {q.questionObj.question}
                  </Text>
                  <Text style={{ fontSize: 25, color: '#4388d6' }}>
                    Answer:{' '}
                    <Text style={{ fontSize: 20 }}>{q.patientAnswer}</Text>
                  </Text>
                </View>
                <Divider
                  inset={true}
                  insetType='middle'
                  style={{ marginBottom: 15 }}
                />
              </View>
            );
          })}

          {/* Display saved scans only if there are scans */}
          {qStatus.scans.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text h3 style={{ color: '#4388d6', marginBottom: 12 }}>
                Saved Scans
              </Text>
              {qStatus.scans.map((scan) => (
                <View key={scan.key} style={{ marginBottom: 15 }}>
                  <Text style={{ fontSize: 20, color: '#4388d6' }}>
                    Description:{' '}
                    <Text style={{ fontSize: 15 }}>{scan.description}</Text>
                  </Text>
                  <Text style={{ fontSize: 20, color: '#4388d6' }}>
                    Timestamp:{' '}
                    <Text style={{ fontSize: 15 }}>
                      {new Date(scan.timestamp).toLocaleString()}
                    </Text>
                  </Text>
                  {scan.description.includes("Finger") && (
                    <Text style={{ fontSize: 20, color: '#4388d6' }}>
                      Average Temperature:{' '}
                      <Text style={{ fontSize: 15 }}>
                        {calculateAverageTemperature(scan.data)} °C
                      </Text>
                    </Text>
                  )}
                  <Divider
                    inset={true}
                    insetType='middle'
                    style={{ marginBottom: 10, marginTop: 10 }}
                  />
                </View>
              ))}
            </View>
          )}

          <View style={styles.constinerResultsButtons}>
            <Button
              title={'Save'}
              buttonStyle={{
                borderWidth: 2,
                borderColor: '#4388d6',
                borderRadius: 10,
              }}
              titleStyle={{
                color: 'white',
                fontSize: 25,
                width: 120,
                fontWeight: 'bold',
              }}
              onPress={() => saveData()}
            />

            <Button
              title={'Restart'}
              buttonStyle={{
                borderWidth: 2,
                borderColor: '#4388d6',
                borderRadius: 10,
              }}
              titleStyle={{
                color: '#4388d6',
                fontSize: 25,
                width: 120,
                fontWeight: 'bold',
              }}
              type='outline'
              onPress={restartQuestionnaire}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  return <View></View>;
};

const styles = StyleSheet.create({
  containerStart: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    height: '100%',
  },

  constainerInstructions: {
    marginHorizontal: 25,
  },

  containerStartButton: {},

  containerQuestionnaire: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  containerQuestion: {
    paddingHorizontal: 25,
  },

  containerResults: {
    marginVertical: 30,
    marginHorizontal: 15,
  },
  containerSaved: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    marginTop: 50,
  },

  constinerResultsButtons: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-around',
    margin: 10,
  },
});

export default Questionnaire;
