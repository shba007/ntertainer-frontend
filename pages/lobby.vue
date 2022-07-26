<script setup lang="ts">
import { useMedia } from '~/stores/media';
import { usePlayer } from '~/stores/player';
import { useUser } from '~/stores/user';
import { formatTime, trim } from '~/utils/helpers';
import { Media, Room } from '~/utils/models';

useHead({
	title: "Ntertainer - Lobby"
})

const config = useRuntimeConfig()
const route = useRoute()
const media = useMedia()
const user = useUser()
const player = usePlayer()
// TODO: SSE ADD

media.init(route.query.type as string, route.query.id as string)

const { pending: infoPending, error: infoError, data: info, refresh: infoRefresh } = useLazyFetch<Media>(`media/${media.type}/${media.id}`, { baseURL: config.public.apiURL })
watch(info, (newInfo) => {
	media.title = newInfo.title
	media.episodes = newInfo?.episodes ? newInfo?.episodes : [1]
	console.debug(`Media Info Title: ${media.title} Episodes: ${media.episodes}`);
})

const { pending: roomPending, error: roomError, data: room, refresh: roomRefresh } = useLazyFetch<Room>(`room`, { baseURL: config.public.apiURL })
watch(room, (newRoom) => {
	const { episode, buffer, playback, playbackRate, seek } = newRoom.player
	player.init(episode, buffer, playback, playbackRate, seek)
	console.debug(`Room Player Info Episode: ${episode} Buffer: ${buffer} Playback: ${playback} PlaybackRate: ${playbackRate} Seek: ${seek.time}`);
})

const container = ref<HTMLVideoElement>()
const participants = [
	{
		id: "1",
		avatar: `https://avatars.dicebear.com/api/adventurer/${1}.svg?r=50`
	},
	{
		id: "2",
		avatar: `https://avatars.dicebear.com/api/adventurer/${2}.svg?r=50`
	},
	{
		id: "3",
		avatar: `https://avatars.dicebear.com/api/adventurer/${3}.svg?r=50`
	}
]
const seed = (Math.random() + 1).toString(36).substring(7)
const avatar = ref(`https://avatars.dicebear.com/api/adventurer/${seed}.svg?r=50`)
const poster = computed(() => `${config.public.apiURL}/public/${media.type}/${media.id}/Portrait.avif`)
const isSettings = ref(false)

function toggleSettings() {
	isSettings.value = !isSettings.value
}
function refresh() {
	infoRefresh()
	roomRefresh()
}

watchEffect(() => {
	if (container.value && user.stream)
		container.value.srcObject = user.stream
})
</script>

<template>
	<PageState :pending="infoPending || roomPending" :error="infoError || roomError" @refresh="refresh"
		class="flex flex-col justify-between gap-4 mb-4 h-screen text-black">
		<div class="relative flex-1 flex justify-center items-center rounded-b-[2rem] bg-slate-200 overflow-hidden">
			<NuxtIcon name="image" class="text-5xl" />
			<img :src="poster" alt="poster" class="absolute top-0 bottom-0 left-0 right-0 object-cover" />
		</div>
		<section>
			<h1 class="text-2xl font-head">{{ info.title }}</h1>
			<ul class="flex items-center gap-2 text-xs mt-[2px] mb-[10px]">
				<li>{{ formatTime(info.duration, false) }}</li>
				&bull;
				<li><time :datatype="info.release.date">{{ useDateFormat(info.release.date, 'YYYY').value }}</time>
				</li>
			</ul>
			<ul class="flex items-center gap-2 text-[10px]">
				<li v-for="genre in info.genres.slice(0, 3)" :key="genre"
					class="rounded-full px-[10px] py-1 text-center bg-slate-300 whitespace-nowrap">
					{{ genre }}
				</li>
			</ul>
		</section>
		<section class="relative">
			<div
				class="grid grid-rows-[3fr_3fr_2fr] grid-cols-[8fr_15fr_25fr] justify-items-center items-center rounded-xl w-full aspect-video bg-slate-200 overflow-hidden">
				<div
					class="row-start-1 row-span-3 col-start-1 col-span-3 p-[6px] rounded-full bg-slate-300 overflow-hidden">
					<img :src="avatar" alt="avatar" class="w-12 md:w-14 lg:w-20" />
				</div>
				<video ref="container" muted autoplay playsinline
					class="row-start-1 row-span-3 col-start-1 col-span-3 w-full h-full object-cover" />
			</div>
			<ul
				class="absolute bottom-0 left-0 right-0 grid grid-cols-[repeat(2,min-content)_auto_min-content] gap-4 m-3">
				<li class="rounded-full p-2 bg-slate-300 cursor-pointer" @click="user.toggleMicrophone">
					<NuxtIcon :name="user.audio ? 'microphone' : 'microphone-off'" class="text-2xl" />
				</li>
				<li class="rounded-full p-2 bg-slate-300 cursor-pointer" @click="user.toggleCamera">
					<NuxtIcon :name="user.video ? 'camera' : 'camera-off'" class="text-2xl" />
				</li>
				<li class="col-start-4 rounded-full p-2 bg-slate-300 cursor-pointer justify-self-end"
					@click="toggleSettings">
					<NuxtIcon name="gear" class="text-2xl" />
				</li>
			</ul>
			<dialog :open="isSettings"
				class="fixed bottom-0 left-0 right-0 mx-0 rounded-t-3xl w-full bg-slate-300 z-10">
				<NuxtIcon name="gear" class="relative ml-auto text-2xl" @click="toggleSettings" />
				<ul>
					<li class="text-center text-lg font-medium">Microphone</li>
					<li v-for="microphone in user.microphones"
						:class="{ 'text-sky-500': microphone.id === user.currentMicrophone.id }"
						@click="user.setMicrophone(microphone)">
						{{ trim(microphone.label,28)}}
					</li>
				</ul>
				<ul>
					<li class="text-center text-lg font-medium">Camera</li>
					<li v-for="camera in user.cameras" :class="{ 'text-sky-500': camera.id === user.currentCamera.id }"
						@click="user.setCamera(camera)">
						{{ camera.label }}
					</li>
				</ul>
			</dialog>
		</section>
		<section class="flex">
			<div v-for="(participant, index) in participants" class="rounded-full p-[6px] bg-slate-300 overflow-hidden"
				:class="{ '-ml-6': index !== 0 }">
				<img :src="participant.avatar" :alt="participant.id" class="w-12 md:w-14 lg:w-20 aspect-square" />
			</div>
		</section>
		<NuxtLink to="/watch"
			class="fixed bottom-0 right-0 flex gap-[6px] items-center rounded-tl-full pl-7 pr-6 pt-3 pb-2 text-white bg-sky-500">
			<NuxtIcon name="plus" class="text-2xl" />Join
		</NuxtLink>
	</PageState>
</template>