<?php
/**
 * Plugin Name: MAHotels Jobs Lite
 * Description: Lightweight job display and WordPress REST bridge. Recruitment, translation and scheduling run outside WordPress.
 * Version: 0.1.2
 * Author: MAHotels
 * Text Domain: mah-jobs-lite
 * Requires PHP: 7.4
 */
defined('ABSPATH') || exit;

/**
 * Coexists safely during testing: the old plugin retains full control while
 * active. Existing posts, taxonomies and shortcode content are not modified.
 */
add_action('init', function () {
    if (!post_type_exists('ma_hotel_job')) {
        register_post_type('ma_hotel_job', array(
            'labels' => array(
                'name' => 'الوظائف الفندقية',
                'singular_name' => 'وظيفة فندقية',
                'add_new_item' => 'إضافة وظيفة فندقية',
                'edit_item' => 'تحرير الوظيفة',
            ),
            'public' => true,
            'show_ui' => true,
            'show_in_menu' => true,
            'show_in_rest' => true,
            'rest_base' => 'ma_hotel_job',
            'rest_controller_class' => 'WP_REST_Posts_Controller',
            'has_archive' => false, // /hotel-jobs is an existing Page, not a CPT archive.
            'rewrite' => array('slug' => 'hotel-job', 'with_front' => false),
            'supports' => array('title', 'editor', 'excerpt', 'revisions'),
            'map_meta_cap' => true,
        ));
    }

    if (!taxonomy_exists('ma_job_country')) {
        register_taxonomy('ma_job_country', array('ma_hotel_job'), array(
            'labels' => array('name' => 'الدول', 'singular_name' => 'الدولة'),
            'public' => true,
            'show_ui' => true,
            'show_admin_column' => true,
            'show_in_rest' => true,
            'rest_base' => 'ma_job_country',
            'hierarchical' => false,
            'rewrite' => array('slug' => 'hotel-jobs/country', 'with_front' => false),
        ));
    } else {
        register_taxonomy_for_object_type('ma_job_country', 'ma_hotel_job');
    }
}, 99);

/**
 * During coexistence let the old shortcode win. After retirement the existing
 * [ma_hotels_jobs] page seamlessly displays the same stored job posts.
 */
add_action('init', function () {
    if (shortcode_exists('ma_hotels_jobs')) {
        return;
    }
    add_shortcode('ma_hotels_jobs', 'mah_jobs_lite_shortcode');
}, 999);

// Independent, administrator-only preview while the legacy shortcode owns
// the live page. Never expose unpublished jobs or change the existing shortcode.
add_action('init', function () {
    add_shortcode('ma_hotels_jobs_lite_preview', function ($atts = array()) {
        if (!current_user_can('manage_options')) {
            return '';
        }
        return '<div class="mah-jobs-lite-preview"><p><strong>معاينة إدارية لإضافة MAHotels Jobs Lite</strong></p>'
            . mah_jobs_lite_shortcode($atts) . '</div>';
    });
}, 999);

function mah_jobs_lite_shortcode($atts = array()) {
    $atts = shortcode_atts(array('per_page' => 12), (array) $atts, 'ma_hotels_jobs');
    $per_page = min(24, max(1, absint($atts['per_page'])));
    $page = isset($_GET['mhj_page']) ? max(1, absint(wp_unslash($_GET['mhj_page']))) : 1;
    $country = isset($_GET['mhj_country']) ? absint(wp_unslash($_GET['mhj_country'])) : 0;

    $terms = get_terms(array('taxonomy' => 'ma_job_country', 'hide_empty' => true));
    if (is_wp_error($terms)) {
        $terms = array();
    }
    $allowed = array();
    foreach ($terms as $term) {
        $allowed[(int) $term->term_id] = $term;
    }
    if ($country && !isset($allowed[$country])) {
        $country = 0;
    }

    $args = array(
        'post_type' => 'ma_hotel_job',
        'post_status' => 'publish',
        'posts_per_page' => $per_page,
        'paged' => $page,
        'orderby' => 'date',
        'order' => 'DESC',
        'no_found_rows' => false,
        'ignore_sticky_posts' => true,
    );
    if ($country) {
        $args['tax_query'] = array(array(
            'taxonomy' => 'ma_job_country',
            'field' => 'term_id',
            'terms' => array($country),
            'include_children' => false,
        ));
    }

    $jobs = new WP_Query($args);
    ob_start();
    ?>
    <div class="mah-jobs-lite" dir="rtl">
        <style>
        .mah-jobs-lite{font-family:inherit;color:#213a41}
        .mah-jobs-lite__filters{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:0 0 24px}
        .mah-jobs-lite__filters label{font-weight:600}
        .mah-jobs-lite__filters select{min-width:180px;padding:10px;background:#fff;border:1px solid #cfdadc;border-radius:8px}
        .mah-jobs-lite__filters button{background:#116874;color:#fff;border:0;border-radius:8px;padding:10px 22px;cursor:pointer}
        .mah-jobs-lite__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px}
        .mah-jobs-lite__item{padding:22px;border:1px solid #e0e7e8;border-radius:13px;background:#fff}
        .mah-jobs-lite__item h3{font-size:1.1rem;line-height:1.7;margin:0 0 12px}
        .mah-jobs-lite__item a{text-decoration:none;color:#116874}
        .mah-jobs-lite__item a:hover{text-decoration:underline}
        .mah-jobs-lite__item p{margin:8px 0;color:#5a6d73;line-height:1.7}
        .mah-jobs-lite__paging{display:flex;gap:10px;flex-wrap:wrap;margin:28px 0}
        .mah-jobs-lite__paging a{padding:6px 13px;border:1px solid #cfdadc;border-radius:7px;color:#116874}
        </style>
        <form class="mah-jobs-lite__filters" method="get">
            <label for="mhj-country"><?php echo esc_html('تصفية الوظائف حسب الدولة'); ?></label>
            <select id="mhj-country" name="mhj_country">
                <option value="0"><?php echo esc_html('جميع الدول'); ?></option>
                <?php foreach ($terms as $term) : ?>
                    <option value="<?php echo esc_attr((string) $term->term_id); ?>" <?php selected($country, (int) $term->term_id); ?>>
                        <?php echo esc_html($term->name); ?>
                    </option>
                <?php endforeach; ?>
            </select>
            <button type="submit"><?php echo esc_html('عرض الوظائف'); ?></button>
        </form>
        <div class="mah-jobs-lite__grid">
        <?php if ($jobs->have_posts()) : ?>
            <?php while ($jobs->have_posts()) : $jobs->the_post(); ?>
                <article class="mah-jobs-lite__item">
                    <h3><a href="<?php echo esc_url(get_permalink()); ?>"><?php echo esc_html(get_the_title()); ?></a></h3>
                    <p><?php echo esc_html(wp_trim_words(wp_strip_all_tags(get_the_excerpt() ?: get_the_content()), 28)); ?></p>
                    <a href="<?php echo esc_url(get_permalink()); ?>"><?php echo esc_html('تفاصيل الوظيفة والتقديم'); ?></a>
                </article>
            <?php endwhile; ?>
        <?php else : ?>
            <p><?php echo esc_html('لا توجد وظائف مطابقة حاليًا.'); ?></p>
        <?php endif; ?>
        </div>
        <?php
        if ($jobs->max_num_pages > 1) {
            $base = remove_query_arg('mhj_page');
            echo '<nav class="mah-jobs-lite__paging" aria-label="صفحات الوظائف">';
            if ($page > 1) {
                echo '<a href="' . esc_url(add_query_arg('mhj_page', $page - 1, $base)) . '">السابق</a>';
            }
            if ($page < $jobs->max_num_pages) {
                echo '<a href="' . esc_url(add_query_arg('mhj_page', $page + 1, $base)) . '">التالي</a>';
            }
            echo '</nav>';
        }
        wp_reset_postdata();
        ?>
    </div>
    <?php
    return ob_get_clean();
}

/** Rewrite on activation only; no recurring cron jobs or external network calls. */
register_activation_hook(__FILE__, function () {
    // Registration during the same request is delegated to init on the next load.
    update_option('mah_jobs_lite_rewrite_flush_pending', '1', false);
});
add_action('init', function () {
    if (get_option('mah_jobs_lite_rewrite_flush_pending') !== '1') {
        return;
    }
    delete_option('mah_jobs_lite_rewrite_flush_pending');
    flush_rewrite_rules(false);
}, 1000);
register_deactivation_hook(__FILE__, function () {
    // Never delete job posts, terms, or credentials of the legacy plugin.
    flush_rewrite_rules(false);
});
