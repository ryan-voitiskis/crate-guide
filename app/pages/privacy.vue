<script setup lang="ts">
useHead({ title: 'Privacy Notice · Crate Guide' })
</script>

<template>
	<LayoutLegalDocument
		title="Privacy Notice"
		summary="A plain-language explanation of how the official crate.guide service handles account, library and technical data."
		effective-date="18 July 2026"
	>
		<section>
			<h2>Scope and operator</h2>
			<p>
				This notice applies only to the official service at
				<a href="https://crate.guide">crate.guide</a>
				, operated in Australia by Ryan Voitiskis as a personal, non-commercial
				open-source project. People who deploy their own copy of Crate Guide
				operate a separate service and are responsible for their own privacy
				practices.
			</p>
			<p>
				For privacy questions or requests, email
				<a href="mailto:ryanvoitiskis@protonmail.com">
					ryanvoitiskis@protonmail.com
				</a>
				.
			</p>
		</section>

		<section>
			<h2>Information Crate Guide handles</h2>
			<ul>
				<li>
					<strong>Account data:</strong>
					your email address, account identifier, authentication events and
					profile details supplied by an available sign-in provider. Passwords
					are handled by Supabase Auth and are not available to the operator in
					plain text.
				</li>
				<li>
					<strong>Library data:</strong>
					records, artists, labels, tracks, crates, saved sets, transition
					ratings and preferences that you save.
				</li>
				<li>
					<strong>Discogs data:</strong>
					your Discogs username and avatar, OAuth credentials, selected
					collection data and release metadata when you choose to connect
					Discogs.
				</li>
				<li>
					<strong>Cover artwork:</strong>
					images you upload are cropped and re-encoded in your browser as WebP
					before upload. This normally removes original file metadata. Uploaded
					covers are kept in private storage and displayed using time-limited
					signed links. A signed link can still be viewed by anyone who receives
					it until it expires.
				</li>
				<li>
					<strong>Operational data:</strong>
					IP address, approximate country, browser and device information,
					requested URL, request time, response status and diagnostic
					identifiers may appear in Cloudflare and Supabase security and service
					logs.
				</li>
			</ul>
		</section>

		<section>
			<h2>Data that stays on your device</h2>
			<p>
				Rekordbox XML files and audio files selected for enrichment are read in
				your browser. Crate Guide does not upload the XML file, audio bytes or
				absolute local file paths. Audio tags and analysis results are cached in
				IndexedDB on that device until you clear the site’s browser data. Only
				metadata changes you review and apply are saved to your hosted library.
			</p>
			<p>
				Crate Guide also uses essential browser storage for authentication,
				password-recovery state and interface preferences. There are no
				advertising or behavioural-marketing trackers intentionally installed in
				the application code.
			</p>
		</section>

		<section>
			<h2>Why the information is used</h2>
			<p>The information is used only to:</p>
			<ul>
				<li>create and secure your account;</li>
				<li>provide, synchronise and support your private record library;</li>
				<li>run optional Discogs import and sign-in integrations;</li>
				<li>store and display cover artwork you choose to upload;</li>
				<li>diagnose faults, prevent abuse and maintain the service; and</li>
				<li>respond to privacy, support or security messages.</li>
			</ul>
			<p>
				Crate Guide does not sell personal information and does not use it for
				advertising.
			</p>
		</section>

		<section>
			<h2>Hosting, locations and service providers</h2>
			<p>
				The official service uses the following providers. They may use their
				own subprocessors and process technical data in other countries as
				needed to provide their services.
			</p>
			<ul>
				<li>
					<a href="https://www.cloudflare.com/policies/privacy/">Cloudflare</a>
					hosts and delivers the web application and provides network security.
					It operates a global network and receives web request and network
					diagnostic data.
				</li>
				<li>
					<a href="https://supabase.com/privacy">Supabase</a>
					provides authentication, the database, private file storage, Edge
					Functions and operational logging. Supabase Auth triggers account
					confirmation and recovery email, but the deployed public configuration
					does not reveal whether delivery uses Supabase’s default mail service
					or a custom SMTP provider. The primary project is hosted on Amazon Web
					Services in
					<strong>Frankfurt, Germany</strong>
					(
					<code>eu-central-1</code>
					). Edge Functions normally execute near the caller; for example,
					current requests from Australia execute in Sydney.
				</li>
				<li>
					<a href="https://www.discogs.com/privacy">Discogs</a>
					receives OAuth and API requests only when you connect or use the
					Discogs integration.
				</li>
				<li>
					<a
						href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
					>
						GitHub
					</a>
					and
					<a href="https://policies.google.com/privacy">Google</a>
					process sign-in information only if their sign-in option is available
					and you choose it. Crate Guide receives the account details the
					provider and Supabase make available for authentication.
				</li>
				<li>
					<a href="https://proton.me/legal/privacy">Proton Mail</a>
					processes messages you send to the contact address above.
				</li>
			</ul>
			<p>
				Provider subprocessor lists are maintained by
				<a href="https://supabase.com/downloads/docs/Supabase+DPA+260601.pdf">
					Supabase
				</a>
				and
				<a href="https://www.cloudflare.com/gdpr/subprocessors/">Cloudflare</a>
				and may change over time.
			</p>
		</section>

		<section>
			<h2>Retention, backups and logs</h2>
			<ul>
				<li>
					Account and library information is kept while your account exists or
					until you delete particular content.
				</li>
				<li>
					Deleting your account removes the active account, library data,
					Discogs credentials and managed cover files. Signed image links stop
					working when they expire.
				</li>
				<li>
					The operator does not maintain a separate long-term backup or log
					archive. Supabase manages any system backups and log retention under
					the project’s current plan. The exact rolling periods are not exposed
					by the public deployment configuration and are therefore not promised.
					Deleted database information may remain in a provider backup until
					that backup expires; Supabase database backups do not contain Storage
					file contents.
				</li>
				<li>
					Cloudflare and Supabase keep operational and security logs under their
					current account settings and retention policies. No external log drain
					or application-level error-tracking service is configured in this
					project’s source code.
				</li>
			</ul>
			<p>
				Crate Guide is a proof of concept, not a backup service. Keep your own
				copy of anything you cannot afford to lose.
			</p>
		</section>

		<section>
			<h2>Access, correction and deletion</h2>
			<p>
				You can review and edit much of your library in the application and can
				delete your account from Settings. Account deletion removes your active
				Supabase Auth user, profile, library, Discogs credentials and managed
				cover objects. You may also email the contact address to request access
				to, correction of or deletion of information associated with your
				account. Reasonable identity verification may be required before a
				request is completed.
			</p>
		</section>

		<section>
			<h2>Security, children and changes</h2>
			<p>
				Crate Guide uses access controls and service-provider security features,
				but no online service can guarantee absolute security. Please do not
				upload sensitive personal information in cover images or other library
				fields.
			</p>
			<p>
				The service is not directed to children under 16. If you believe a child
				has supplied personal information, contact the operator so it can be
				removed.
			</p>
			<p>
				This notice may change as the proof of concept develops. Material
				changes will be identified by a new effective date on this page.
			</p>
		</section>
	</LayoutLegalDocument>
</template>
