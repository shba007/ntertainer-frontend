<script setup lang="ts">
import { isNumber } from '@vueuse/shared';
import { useMedia } from '~/stores/media';
import { usePlayer } from '~/stores/player';
import { formatTime, getCodeLang } from '~/utils/helpers'
import { Seek } from '~/utils/models';
import { PlaybackTimeUpdatedEvent, QualityChangeRequestedEvent } from "~/plugins/dash.js.client";

const { $player: player, $playerSocket } = useNuxtApp()
const socket = $playerSocket()

const config = useRuntimeConfig()
const media = useMedia()
const playerStore = usePlayer()

const props = defineProps({
	autoplay: { type: Boolean, required: true }, // Property Binding
	type: {},//Two-way Binding
	id: { type: String, required: true },//Two-way Binding
	episode: { type: Number, required: true }, // Two-way Binding
})

const emits = defineEmits<{
	(event: "update:fullscreen"): void // Event Binding
	(event: "update:controls", state: boolean): void // Event Binding
	(event: "update:episode", episode: number): void // Event Binding
}>()

watch(() => props.episode, (value: number) => {
	console.debug(`Episode ${value} is Playing`)
	player.initialize(video.value, src.value, props.autoplay);
	playerStore.setSeek(0)

	toggleDropdown(null)
})

const container = ref<HTMLElement>()
const video = ref<HTMLVideoElement>()
const subtitle = ref<HTMLDivElement>()

const isInit = ref(false)

const isBuffering = ref(false)
const bufferTime = ref(0)

const isPlaying = ref(false)
const seekTime = ref(0)

const playbackRates = ref([0.5, 0.75, 1, 1.25, 1.5, 2])
const playbackRateIndex = ref(2)

const isAuto = ref(true)
const qualities = ref<string[]>([])
const qualityIndex = ref(0)

const isMuted = ref(false)
const volume = ref(70)

const languages = ref([])
const languageIndex = ref(0)
const subtitles = ref([])
const subtitleIndex = ref(0)
const isSubtitle = ref(false)

const duration = ref(0)
const dropdown = ref<string>(null)

const { isFullscreen } = useFullscreen(container)

const userControls = ref(false)
const { idle } = useIdle(3000)
const controls = computed(() => {
	userControls.value = isPlaying.value ? (userControls.value ? !idle.value : false) : true

	emits("update:controls", userControls.value)
	return userControls.value
})

const tracks = computed(() => {
	return [
		{ value: seekTime.value, color: "bg-blue-400" },
		{ value: seekTime.value + bufferTime.value, color: "bg-slate-200/60" }
	]
})

const poster = computed(() => `${config.public.apiURL}/public/${props.type}/${props.id}/Landscape.avif`)
const src = computed(() => `${config.public.apiURL}/public/${props.type}/${props.id}/${props.episode}/manifest.mpd`)

const debugInfo = ref({
	bitrate: { reported: undefined, calculated: undefined },
	buffer: undefined,
	framerate: undefined,
	resolution: { width: undefined, height: undefined }
})

function changeEpisode(episode: "prev" | "next" | number, sync = true) {
	let newEpisode = isNumber(episode) ? episode : props.episode;
	if (!isNumber(episode))
		newEpisode += episode === "prev" ? -1 : +1
	newEpisode = useClamp(newEpisode, 1, media.totalEpisodes).value

	emits("update:episode", newEpisode)
	if (sync) {
		console.debug(`Local Episode playing ${newEpisode}`);
		socket.emit("episode", newEpisode)
	}

	toggleDropdown(null)
}

function changeBuffer(state: boolean, sync = true) {
	// TODO:Change Buffering
	// if (sync) {
	// 	console.debug(`Local Buffer ${isBuffering.value ? "load" : "empty"} at ${seekTime.value}`);
	//  playerStore.setSeek(seekTime.value)
	// 	socket.emit("buffer", isBuffering.value ? "load" : "empty", playerStore.seekStamp)
	// }
}

function togglePlay(isPaused = player.isPaused(), sync = true) {
	console.debug(`Video is ${isPaused ? "Played" : "Paused"}`);
	isPaused ? player.play() : player.pause()
	isPlaying.value = isPaused
	if (sync) {
		console.debug(`Local Playback ${isPaused ? "play" : "pause"} at ${seekTime.value}`);
		playerStore.playback = isPlaying.value ? "play" : "pause"
		playerStore.setSeek(seekTime.value)
		socket.emit("playback", isPaused ? "play" : "pause", playerStore.seekStamp)
	}

	toggleDropdown(null)
}
function changeSeek(seek: number | Seek, sync = true) {
	playerStore.setSeek(seek)
	seekTime.value = playerStore.seek

	player.seek(seekTime.value)
	bufferTime.value = 0
	if (sync) {
		console.debug(`Local Seek to ${seekTime.value}`);
		socket.emit("seek", playerStore.seekStamp)
	}

	toggleDropdown(null)
}

function changePlaybackRate(rateIndex: number, sync = true) {
	playbackRateIndex.value = useClamp(rateIndex, 0, playbackRates.value.length - 1).value
	player.setPlaybackRate(playbackRates.value[playbackRateIndex.value])
	if (sync) {
		console.debug(`Local PlaybackRate ${playbackRateIndex.value} at ${seekTime.value}`);
		playerStore.setSeek(seekTime.value)
		socket.emit("playback-rate", playbackRateIndex.value, playerStore.seekStamp)
	}

	toggleDropdown(null)
}

function changeQuality(currentResolutionIndex: number) {
	currentResolutionIndex -= 1
	isAuto.value = currentResolutionIndex === -1

	const settings = player.getSettings()
	settings.streaming.abr.autoSwitchBitrate.video = isAuto.value
	player.updateSettings(settings)

	if (!isAuto.value) {
		player.setQualityFor("video", currentResolutionIndex, true)
	}

	toggleDropdown(null)
}

function toggleVolume(isUnmuted = !player.isMuted()) {
	console.debug(`Video is Muted ${isUnmuted}`);
	isMuted.value = isUnmuted
	player.setMute(isMuted.value)

	if (!volume.value)
		changeVolume(70)

	toggleDropdown(null)
}
function changeVolume(value: number) {
	volume.value = useClamp(value, 0, 100).value
	player.setVolume(volume.value / 100)

	if (!volume.value)
		toggleVolume(true)

	toggleDropdown(null)
}

function changeLanguage(currentLangIndex: number) {
	languageIndex.value = currentLangIndex
	player.setCurrentTrack(player.getTracksFor('audio')[languageIndex.value])

	toggleDropdown(null)
}
function changeSubtitle(currentSubtitleIndex: number) {
	isSubtitle.value = Boolean(currentSubtitleIndex)
	player.enableText(isSubtitle.value)

	if (isSubtitle.value === true) {
		subtitleIndex.value = currentSubtitleIndex - 1
		player.setCurrentTrack(player.getTracksFor('text')[subtitleIndex.value])
	}

	toggleDropdown(null)
}

function toggleFullscreen() {
	emits("update:fullscreen")

	toggleDropdown(null)
}

function toggleUserControls() {
	userControls.value = !userControls.value

	toggleDropdown(null)
}

function toggleDropdown(type: string | null) {
	dropdown.value = dropdown.value !== type ? type : null
}

// Input Devices Hooks
function onKeyboardControl(event: KeyboardEvent) {
	switch (event.code) {
		case "Space":
			togglePlay()
			break;
		case "ArrowLeft":
			changeSeek(seekTime.value - 5)
			break;
		case "ArrowRight":
			changeSeek(seekTime.value + 5)
			break;
		case "ArrowUp":
			changeVolume(volume.value + 5)
			break;
		case "ArrowDown":
			changeVolume(volume.value - 5)
			break;
		case "NumpadAdd":
			changePlaybackRate(playbackRateIndex.value + 1)
			break;
		case "NumpadSubtract":
			changePlaybackRate(playbackRateIndex.value - 1)
			break;
		default:
			break;
	}
}

useEventListener(window, "keydown", onKeyboardControl)

// Player Life Cycle Hooks
function onPlayerInit() {
	console.debug("Steam Initialized");
	duration.value = player.duration()

	const textInfo = player.getTracksFor('text')
	console.table(textInfo, ["type", "lang"]);

	const audioInfo = player.getTracksFor('audio')
	console.table(audioInfo, ["type", "lang"]);

	const videoInfo = player.getBitrateInfoListFor("video")
	console.table(videoInfo, ["mediaType", "width", "height", "bitrate"]);

	subtitles.value = textInfo.map((track) => getCodeLang(track.lang))
	languages.value = audioInfo.map((track) => getCodeLang(track.lang))

	// TODO: Algorithm for finding suitable subtitle and language
	subtitleIndex.value = subtitles.value.findIndex((lang) => lang === "English")
	subtitleIndex.value = subtitleIndex.value === -1 ? 0 : subtitleIndex.value
	languageIndex.value = languages.value.findIndex((lang) => lang === "English")
	languageIndex.value = languageIndex.value === -1 ? 0 : languageIndex.value

	qualities.value = []
	for (const info of videoInfo) {
		qualities.value.push(`${info.height.toString()}p`)
	}

	player.attachTTMLRenderingDiv(subtitle.value);

	const settings = player.getSettings()
	settings.streaming.buffer.stableBufferTime = 120
	settings.streaming.buffer.bufferTimeAtTopQuality = 180
	player.updateSettings(settings)

	// TODO: changeBuffer(playerStore.buffer,false)
	togglePlay(props.autoplay, false)
	changePlaybackRate(playerStore.playbackRate, false)
	changeSeek(playerStore.seekStamp, false)
	changeSubtitle(isSubtitle.value ? subtitleIndex.value : 0)

	isInit.value = true
}

function onBufferLoaded() {
	console.debug("Video Buffer Loaded");
	isBuffering.value = false
	changeBuffer(isBuffering.value)
}

function onBufferEmptied() {
	console.debug("Video Buffer Empty");
	isBuffering.value = true
	bufferTime.value = 0
	changeBuffer(isBuffering.value)
}

function onPlaybackUpdate(event: PlaybackTimeUpdatedEvent) {
	seekTime.value = event.time
	bufferTime.value = player.getBufferLength("video")
	bufferTime.value = !isNaN(bufferTime.value) ? bufferTime.value : 0
}

function onQualityChange(event: QualityChangeRequestedEvent) {
	if (event.mediaType === 'video') {
		qualityIndex.value = event.newQuality
		changePlaybackRate(playbackRateIndex.value, false)
	}
}

// Debug info
const { pause: pauseDebug, resume: resumeDebug, isActive: debugMode } = useIntervalFn(() => {
	// TODO: debug info
	const streamInfo = player.getActiveStream().getStreamInfo();
	const dashAdapter = player.getDashAdapter();
	const dashMetrics = player.getDashMetrics();

	const periodIdx = streamInfo.index;
	const repSwitch = dashMetrics.getCurrentRepresentationSwitch('video')

	debugInfo.value.bitrate.reported = repSwitch ? Math.round(dashAdapter.getBandwidthForRepresentation((repSwitch as any).to, periodIdx) / 1000) : NaN;
	debugInfo.value.buffer = dashMetrics.getCurrentBufferLevel('video')

	// TODO: adaptation type dashAdapter
	const adaptation = (dashAdapter as any).getAdaptationForType(periodIdx, 'video', streamInfo);
	const currentRep = adaptation?.Representation_asArray.find((rep) => {
		return rep.id === (repSwitch as any).to
	})

	debugInfo.value.framerate = currentRep.frameRate;
	debugInfo.value.resolution = { width: currentRep.width, height: currentRep.height }

}, 500)
pauseDebug()

function toggleDebugMode(mode: Number | Boolean) {
	!!mode ? resumeDebug() : pauseDebug()

	toggleDropdown(null)
}

// WebSocket Life Cycle Hooks
function onSocketConnect() {
	console.debug("WebSocket Connected", socket.id);
}
function onSocketEpisode(id: string, episode: number) {
	console.debug(`By ${id} episode changed ${episode}`);
	changeEpisode(episode, false)
}
function onSocketBuffer(id: string, state: "load" | "empty", seek: Seek) {
	console.debug(`By ${id} Global Buffer ${state} at ${seek}`);
	// changeBuffer(state == "load" )
	changeSeek(seek, false)
}
function onSocketPlayback(id: string, state: "play" | "pause", seek: Seek) {
	console.debug(`By ${id} Global Playback ${state} at ${seek.time}`);
	togglePlay(state == "play", false)
	changeSeek(seek, false)
}
function onSocketPlaybackRate(id: string, rate: number, seek: Seek) {
	console.debug(`By ${id} Global PlaybackRate ${rate} at ${seek}`);
	changePlaybackRate(rate, false)
	changeSeek(seek, false)
}
function onSocketSeek(id: string, seek: Seek) {
	console.debug(`By ${id} Global Seek to ${seek}`);
	changeSeek(seek, false)
}
function onSocketDisconnect() {
	console.debug("WebSocket Disconnected");
}

onMounted(() => {
	player.initialize(video.value, src.value, false);

	player.on("streamInitialized", onPlayerInit)
	player.on("bufferLoaded", onBufferLoaded)
	player.on("bufferStalled", onBufferEmptied)
	player.on("playbackTimeUpdated", onPlaybackUpdate)
	player.on("qualityChangeRequested", onQualityChange)

	socket.on("connect", onSocketConnect);
	socket.on("episode", onSocketEpisode)
	socket.on("buffer", onSocketBuffer);
	socket.on("playback", onSocketPlayback);
	socket.on("playback-rate", onSocketPlaybackRate);
	socket.on("seek", onSocketSeek);
	socket.on("disconnect", onSocketDisconnect);
})

onBeforeUnmount(() => {
	player.off("streamInitialized", onPlayerInit)
	player.off("bufferLoaded", onBufferLoaded)
	player.off("bufferStalled", onBufferEmptied)
	player.off("playbackTimeUpdated", onPlaybackUpdate)
	player.off("qualityChangeRendered", onQualityChange)

	socket.off("connect", onSocketConnect);
	socket.off("episode", onSocketEpisode)
	socket.off("buffer", onSocketBuffer);
	socket.off("playback", onSocketPlayback);
	socket.off("playback-rate", onSocketPlaybackRate);
	socket.off("seek", onSocketSeek);
	socket.off("disconnect", onSocketDisconnect);

	socket.disconnect()
})
</script>

<template>
	<main ref="container"
		class="relative -top-4 md:top-0 -left-2 md:left-0 w-[calc(100%+1rem)] md:w-full h-full md:rounded-lg bg-black overflow-hidden">
		<video ref="video" :poster="poster" class="absolute w-full h-full object-cover pc:object-contain"
			@click="toggleUserControls" />
		<div ref="subtitle" v-show="isSubtitle" />
		<div v-if="isInit && controls" class="absolute w-full h-full bg-gradient-to-t backdrop-gradient" />
		<div v-if="isInit && isBuffering"
			class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[calc(50%+1.25rem)]">
			<NuxtIcon name="loader" class="text-7xl" />
		</div>
		<section v-if="isInit"
			class="relative top-1/2 grid grid-rows-[min-content_auto_min-content] grid-cols-3 gap-y-2 px-2 md:px-6 py-3 w-full -translate-y-1/2 transition-[height_opacity] duration-300 ease-out"
			:class="controls ? 'h-full opacity-100 cursor-auto' : 'h-[200%] opacity-0 cursor-none'"
			@click.self="toggleUserControls">
			<div
				class="row-start-1 col-start-1 col-span-2 invisible landscape:visible justify-start self-start text-xl font-head">
				{{ media.title }}: S{{1}} E-{{props.episode}}/{{14}}
			</div>
			<div class="row-start-1 col-start-3 justify-end self-start flex items-center gap-6">
				<NuxtIcon name="cast" class="text-[2rem] cursor-pointer" />
			</div>
			<div
				class="row-start-2 col-start-2 justify-center self-center flex pc:invisible items-center gap-8 translate-y-0 landscape:-translate-y-5 ">
				<VideoControls v-if="!isBuffering" :playback="isPlaying" @update:playback="togglePlay"
					@update:episode="changeEpisode" />
			</div>
			<div
				class="absolute -left-1 -right-1 -bottom-1 landscape:relative row-start-3 landscape:row-start-2 col-start-1 col-span-3 self-end">
				<VideoSlider :max="duration" :tracks="tracks" @update:tracks="changeSeek" />
			</div>
			<div class="row-start-3 col-start-1 col-span-2 justify-start self-end flex items-center gap-4">
				<VideoControls class="hidden pc:inline" :playback="isPlaying" @update:playback="togglePlay"
					@update:episode="changeEpisode" />
				<NuxtIcon :name="isMuted ? 'volume-muted' : 'volume-full'"
					class="hidden landscape:inline text-[2rem] cursor-pointer" @click="toggleVolume()" />
				<VideoSlider :max="100" :tracks="[{ value: Number(!isMuted) * volume, color: 'bg-slate-200' }]"
					@update:tracks="changeVolume" class="hidden landscape:flex w-24" />
				<span class="font-mono">{{ formatTime(seekTime) }} / {{ formatTime(duration) }}</span>
			</div>
			<div class="row-start-3 col-start-3 justify-end self-end flex items-center gap-6">
				<!-- <NuxtIcon :name="isSubtitle ? 'subtitle' : 'subtitle-off'" class="invisible landscape:visible text-[2rem] cursor-pointer" @click="toggleSubtitle" /> -->
				<!-- <NuxtIcon name="sound-settings" class="invisible landscape:visible text-[2rem] cursor-pointer" /> -->
				<NuxtIcon name="gear" class="invisible landscape:visible text-[2rem] cursor-pointer"
					@click="toggleDropdown('settings')" />
				<NuxtIcon :name="isFullscreen ? 'screen-min' : 'screen-max'" @click="toggleFullscreen"
					class="text-[2rem] cursor-pointer" />
			</div>
			<VideoMenu v-model:dropdown="dropdown" :color="{value:['SDR', 'HDR'][0], index:0, options:['SDR','HDR']}"
				@update:color=""
				:resolution="{value:`${isAuto ? 'Auto': ''} ${qualities[qualityIndex]}`, index:isAuto ? 0 : qualityIndex + 1, options:['Auto', ...qualities]}"
				@update:resolution="changeQuality"
				:playbackRate="{value:`${playbackRates[playbackRateIndex]}x`, index:playbackRateIndex , options:playbackRates}"
				@update:playbackRate="changePlaybackRate"
				:language="{value:languages[languageIndex], index:languageIndex, options:languages}"
				@update:language="changeLanguage"
				:subtitle="{value:isSubtitle ? subtitles[subtitleIndex]: 'Off', index:isSubtitle ? subtitleIndex + 1 : 0, options:['Off', ...subtitles]}"
				@update:subtitle="changeSubtitle"
				:debug="{value:['Off','On'][Number(debugMode)],index:Number(debugMode),options:['Off','On']}"
				@update:debug="toggleDebugMode" />
		</section>
		<dialog :open="debugMode"
			class="absolute top-2 left-2 m-0 px-4 py-2 w-fit text-xs text-white bg-slate-600/40 rounded-md shadow-lg">
			<div>
				<label for="reportedBitrate">Reported bitrate: </label>
				<span>{{ debugInfo.bitrate.reported }} Kbps</span>
			</div>
			<div>
				<label for="calculatedBitrate">Calculated bitrate: </label>
				<span>{{ debugInfo.bitrate.calculated }} Kbps</span>
			</div>
			<div>
				<label for="buffer">Buffer level: </label>
				<span>{{ debugInfo.buffer }} secs</span>
			</div>
			<div>
				<label for="framerate">Framerate: </label>
				<span>{{ debugInfo.framerate }} fps</span>
			</div>
			<div>
				<label for="resolution">Resolution: </label>
				<span>{{ debugInfo.resolution.width }}x{{ debugInfo.resolution.height }}</span>
			</div>
		</dialog>
	</main>
</template>

<style scoped>
main {
	color: white;
}

main>div.backdrop-gradient {
	--tw-gradient-stops: rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0) 80%, rgba(0, 0, 0, 0.3) 100%;
}
</style>