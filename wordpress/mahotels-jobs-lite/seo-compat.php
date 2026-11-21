<?php
/** SEO compatibility copied from MA Hotels Jobs 0.7.0. Loaded only when the
 * legacy plugin is absent, so its hooks cannot run twice during coexistence. */
defined( 'ABSPATH' ) || exit;
final class MA_Hotels_Jobs_Lite_SEO {
    const TYPE = 'ma_hotel_job';
    const COUNTRY = 'ma_job_country';
    public static function init() {
        add_filter( 'wp_robots', array( __CLASS__, 'robots' ) );
        add_filter( 'rank_math/frontend/robots', array( __CLASS__, 'rank_math_robots' ) );
        add_filter( 'rank_math/frontend/canonical', array( __CLASS__, 'canonical' ) );
        add_filter( 'rank_math/sitemap/entry', array( __CLASS__, 'sitemap_entry' ), 10, 3 );
        add_filter( 'rank_math/frontend/title', array( __CLASS__, 'seo_title' ) );
        add_filter( 'rank_math/frontend/description', array( __CLASS__, 'seo_description' ) );
        add_action( 'wp_head', array( __CLASS__, 'job_schema' ), 25 );
    }
	private static function is_imported_single() {
		return is_singular( self::TYPE ) && get_post_meta( get_queried_object_id(), '_ma_job_source_id', true );
	}

	public static function eligible( $id ) {
		if ( 'publish' !== get_post_status( $id ) || '1' !== get_post_meta( $id, '_ma_job_ar_ready', true ) ) { return false; }
		$posted = get_post_meta( $id, '_ma_job_posted_on', true );
		$verified = get_post_meta( $id, '_ma_job_verified_on', true );
		$expires = get_post_meta( $id, '_ma_job_expires_on', true );
		$source = get_post_meta( $id, '_ma_job_source_url', true );
		$terms = wp_get_post_terms( $id, self::COUNTRY, array( 'fields' => 'slugs' ) );
		if ( ! $posted || ! $verified || strtotime( $posted ) > time() || strtotime( $posted ) < time() - 60 * DAY_IN_SECONDS ||
			strtotime( $verified ) < time() - 7 * DAY_IN_SECONDS || ( $expires && $expires < current_time( 'Y-m-d' ) ) ||
			! $source || ! in_array( strtolower( (string) wp_parse_url( $source, PHP_URL_HOST ) ), array( 'jobs.smartrecruiters.com', 'careers.marriott.com', 'careers.rotana.com', 'apply.workable.com', 'rotana-hotels.workable.com', 'careers.ihg.com' ), true ) ||
			is_wp_error( $terms ) || count( $terms ) !== 1 || ! get_post_meta( $id, '_ma_job_company', true ) ||
			! get_post_meta( $id, '_ma_job_city', true ) || ! get_post_meta( $id, '_ma_job_role', true ) ) { return false; }
		if ( ! preg_match( '/[\x{0600}-\x{06FF}]/u', get_the_title( $id ) ) || preg_match( '/[\x{4E00}-\x{9FFF}]/u', get_the_title( $id ) . get_post_meta( $id, '_ma_job_role', true ) ) ) { return false; }
		$content = get_post_field( 'post_content', $id );
		return mb_strlen( wp_strip_all_tags( $content ) ) >= 300 &&
			false !== strpos( $content, 'المهام والمسؤوليات' ) && false !== strpos( $content, 'المتطلبات والمؤهلات' );
	}

	public static function robots( $robots ) {
		if ( self::filtered_board() ) { unset( $robots['index'] ); $robots['noindex'] = true; }
		if ( self::is_imported_single() && ! self::eligible( get_queried_object_id() ) ) {
			unset( $robots['index'] );
			$robots['noindex'] = true;
		}
		return $robots;
	}

	public static function rank_math_robots( $robots ) {
		if ( self::is_imported_single() ) {
			$indexable = self::eligible( get_queried_object_id() );
			$robots['index'] = $indexable ? 'index' : 'noindex';
		}
		if ( self::filtered_board() ) { $robots['index'] = 'noindex'; }
		return $robots;
	}

	public static function seo_title( $title ) {
		if ( self::is_board() ) { return 'وظائف الفنادق والضيافة' . self::country_label() . ' | MA Hotels'; }
		if ( self::is_imported_single() && self::eligible( get_queried_object_id() ) ) {
			return get_the_title( get_queried_object_id() ) . ' | وظائف الفنادق والضيافة - MA Hotels';
		}
		return $title;
	}

	public static function seo_description( $description ) {
		if ( self::is_board() ) { return 'تصفح وظائف الفنادق والضيافة' . self::country_label() . '، وابحث حسب المدينة والمسمى وتاريخ الإعلان، مع تفاصيل المهام والمؤهلات والتقديم عبر المصدر الأصلي.'; }
		if ( self::is_imported_single() && self::eligible( get_queried_object_id() ) ) {
			$id = get_queried_object_id();
			return wp_trim_words( wp_strip_all_tags( get_post_field( 'post_excerpt', $id ) ), 30, '…' ) . ' التقديم عبر صفحة ' . get_post_meta( $id, '_ma_job_company', true ) . ' الأصلية.';
		}
		return $description;
	}

	public static function job_schema() {
		if ( ! self::is_imported_single() ) { return; }
		$id = get_queried_object_id();
		if ( ! self::eligible( $id ) ) { return; }
		$terms = wp_get_post_terms( $id, self::COUNTRY, array( 'fields' => 'slugs' ) );
		$codes = array_flip( array( 'SA' => 'saudi-arabia', 'AE' => 'united-arab-emirates', 'BH' => 'bahrain', 'OM' => 'oman', 'JO' => 'jordan', 'EG' => 'egypt', 'LB' => 'lebanon', 'MA' => 'morocco' ) );
		$country = $codes[ $terms[0] ] ?? '';
		if ( ! $country ) { return; }
		$company = get_post_meta( $id, '_ma_job_company', true );
		$schema = array(
			'@context' => 'https://schema.org', '@type' => 'JobPosting',
			'title' => trim( explode( ' – ', get_the_title( $id ), 2 )[0] ),
			'description' => wp_kses_post( get_post_field( 'post_content', $id ) ),
			'datePosted' => get_post_meta( $id, '_ma_job_posted_on', true ),
			'hiringOrganization' => array( '@type' => 'Organization', 'name' => $company ),
			'jobLocation' => array( '@type' => 'Place', 'address' => array( '@type' => 'PostalAddress',
				'addressLocality' => get_post_meta( $id, '_ma_job_city', true ), 'addressCountry' => $country ) ),
			'url' => get_permalink( $id ),
		);
		$source_id = get_post_meta( $id, '_ma_job_source_id', true );
		if ( $source_id ) { $schema['identifier'] = array( '@type' => 'PropertyValue', 'name' => $company, 'value' => $source_id ); }
		$expires = get_post_meta( $id, '_ma_job_expires_on', true );
		if ( $expires ) { $schema['validThrough'] = $expires; }
		echo '<script type="application/ld+json">' . wp_json_encode( $schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP ) . '</script>' . "\n";
	}


	private static function is_board() {
		return is_singular( 'page' ) && has_shortcode( get_post_field( 'post_content', get_queried_object_id() ), 'ma_hotels_jobs' );
	}
	private static function country_label() {
		$slug = isset( $_GET['mh_country'] ) && is_scalar( $_GET['mh_country'] ) ? sanitize_title( wp_unslash( $_GET['mh_country'] ) ) : '';
		$term = $slug ? get_term_by( 'slug', $slug, self::COUNTRY ) : false;
		return $term ? ' في ' . $term->name : '';
	}
	private static function filtered_board() {
		if ( ! self::is_board() ) { return false; }
		foreach ( array( 'mh_city', 'mh_role', 'mh_month', 'mh_year', 'mhj_city', 'mhj_job', 'mhj_month', 'mhj_year', 'mhj_country' ) as $key ) { if ( ! empty( $_GET[ $key ] ) ) { return true; } }
		return isset( $_GET['mh_country'] ) && ( ! is_scalar( $_GET['mh_country'] ) || ! get_term_by( 'slug', sanitize_title( wp_unslash( $_GET['mh_country'] ) ), self::COUNTRY ) );
	}
	public static function canonical( $url ) {
		if ( ! self::is_board() ) { return $url; }
		$url = get_permalink( get_queried_object_id() );
		$slug = isset( $_GET['mh_country'] ) && is_scalar( $_GET['mh_country'] ) ? sanitize_title( wp_unslash( $_GET['mh_country'] ) ) : '';
		if ( $slug && get_term_by( 'slug', $slug, self::COUNTRY ) ) { $url = add_query_arg( 'mh_country', $slug, $url ); }
		if ( ! self::filtered_board() && isset( $_GET['mh_page'] ) && is_scalar( $_GET['mh_page'] ) && absint( $_GET['mh_page'] ) > 1 ) { $url = add_query_arg( 'mh_page', absint( $_GET['mh_page'] ), $url ); }
		return $url;
	}
	public static function sitemap_entry( $url, $type, $object ) {
		if ( 'post' === $type && isset( $object->ID ) && self::TYPE === get_post_type( $object->ID ) && ! self::eligible( $object->ID ) ) { return false; }
		return $url;
	}
}
MA_Hotels_Jobs_Lite_SEO::init();
