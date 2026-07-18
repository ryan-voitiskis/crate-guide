<script setup lang="ts">
definePageMeta({ layout: 'legal' })
useHead({ title: 'Hosted Service Terms · Crate Guide' })
</script>

<template>
	<LayoutLegalDocument
		title="Hosted Service Terms"
		summary="Simple terms for using the official crate.guide proof-of-concept service. These are separate from the AGPL software licence."
		effective-date="18 July 2026"
	>
		<section>
			<h2>About the service</h2>
			<p>
				These terms apply to the official service at
				<a href="https://crate.guide">crate.guide</a>
				, operated in Australia by Ryan Voitiskis. Crate Guide is a personal,
				non-commercial, open-source proof of concept for managing a record
				collection. By creating an account or using the hosted service, you
				agree to these terms. The
				<NuxtLink to="/privacy">Privacy Notice</NuxtLink>
				explains how the service handles personal information.
			</p>
			<p>
				Self-hosted copies are not operated by crate.guide and are not covered
				by these hosted-service terms.
			</p>
		</section>

		<section>
			<h2>Your account</h2>
			<p>
				Provide accurate account information, keep access to your email and
				sign-in providers secure, and notify the operator if you believe your
				account has been compromised. You are responsible for activity carried
				out through your account.
			</p>
		</section>

		<section>
			<h2>Acceptable use</h2>
			<p>Do not use the service to:</p>
			<ul>
				<li>break the law or infringe another person’s rights;</li>
				<li>
					upload unlawful, abusive, malicious or deliberately sensitive personal
					content;
				</li>
				<li>probe, bypass or interfere with security or access controls;</li>
				<li>
					disrupt the service, automate unreasonable request volumes or consume
					resources in a way that harms other users; or
				</li>
				<li>misrepresent your affiliation with Crate Guide or Discogs.</li>
			</ul>
		</section>

		<section>
			<h2>Your content</h2>
			<p>
				You keep any rights you hold in information and cover artwork you
				upload. You confirm that you have the rights or permission needed to
				upload and use that content. You grant the operator a limited,
				non-exclusive licence to host, copy, crop, re-encode and display it only
				to operate and secure the hosted service.
			</p>
			<p>
				Uploaded content is not licensed under the AGPL merely because it is
				stored by Crate Guide. The operator may remove content after a credible
				legal or rights complaint. Copyright concerns can be sent to
				<a href="mailto:ryanvoitiskis@protonmail.com">
					ryanvoitiskis@protonmail.com
				</a>
				.
			</p>
		</section>

		<section>
			<h2>Discogs</h2>
			<p>
				The optional Discogs integration is also subject to the
				<a
					href="https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use"
				>
					Discogs API Terms of Use
				</a>
				and Discogs may change or withdraw its API.
			</p>
			<p>
				This application uses Discogs’ API but is not affiliated with, sponsored
				or endorsed by Discogs. “Discogs” is a trademark of Zink Media, LLC.
			</p>
			<p><a href="https://www.discogs.com">Data provided by Discogs.</a></p>
		</section>

		<section>
			<h2>Open-source software</h2>
			<p>
				The Crate Guide source code is available under the
				<a
					href="https://github.com/ryan-voitiskis/crate-guide/blob/main/LICENSE"
				>
					GNU Affero General Public License version 3
				</a>
				. That licence governs copying, modifying and distributing the software.
				These terms govern use of the official hosted service. One does not
				replace the other.
			</p>
		</section>

		<section>
			<h2>Availability and your data</h2>
			<p>
				The service is experimental and is provided without a service-level
				agreement. Features may change, fail or be withdrawn, and third-party
				services may become unavailable. Keep your own copy of data you cannot
				afford to lose.
			</p>
			<p>
				You can delete your account in Settings. The operator may suspend or
				close an account where reasonably necessary to address abuse, security,
				legal requirements or service discontinuation. Where practical, notice
				will be given before a non-urgent closure.
			</p>
		</section>

		<section>
			<h2>Warranties and liability</h2>
			<p>
				To the extent permitted by law, the hosted service is provided “as is”
				and “as available”, without promises that it will be uninterrupted,
				accurate, secure or fit for a particular purpose. To the extent
				permitted by law, the operator is not liable for indirect or
				consequential loss, lost data, lost profits or reliance on imported or
				analysed metadata.
			</p>
			<p>
				Nothing in these terms excludes rights or remedies that cannot lawfully
				be excluded, including any applicable Australian Consumer Law rights.
			</p>
		</section>

		<section>
			<h2>Changes, law and contact</h2>
			<p>
				These terms may change as the proof of concept develops. Material
				changes will be identified by a new effective date. Continued use after
				the new date means the updated terms apply from then on.
			</p>
			<p>
				These terms are governed by the laws of Victoria, Australia. Questions
				or notices can be sent to
				<a href="mailto:ryanvoitiskis@protonmail.com">
					ryanvoitiskis@protonmail.com
				</a>
				.
			</p>
		</section>
	</LayoutLegalDocument>
</template>
